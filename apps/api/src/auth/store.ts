import { fileURLToPath } from "node:url";

import type { PGlite } from "@electric-sql/pglite";
import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  dashboardSessions,
  extensionExchangeCodes,
  extensionOAuthAttempts,
  extensionSessions,
  oauthAttempts,
} from "./schema.ts";

export interface AuthStore {
  consumeExtensionExchangeCode(input: {
    codeChallenge: string;
    codeHash: string;
    now: Date;
  }): Promise<{ login: string; twitchUserId: string } | undefined>;
  consumeExtensionOAuthAttempt(input: {
    now: Date;
    stateHash: string;
  }): Promise<{ codeChallenge: string; redirectUri: string } | undefined>;
  consumeOAuthAttempt(input: {
    browserBindingHash: string;
    now: Date;
    stateHash: string;
  }): Promise<boolean>;
  createOAuthAttempt(input: {
    browserBindingHash: string;
    expiresAt: Date;
    stateHash: string;
  }): Promise<void>;
  createExtensionExchangeCode(input: {
    codeChallenge: string;
    codeHash: string;
    expiresAt: Date;
    login: string;
    twitchUserId: string;
  }): Promise<void>;
  createExtensionOAuthAttempt(input: {
    codeChallenge: string;
    expiresAt: Date;
    redirectUri: string;
    stateHash: string;
  }): Promise<void>;
  createExtensionSession(input: {
    accessExpiresAt: Date;
    accessTokenHash: string;
    familyId: string;
    login: string;
    refreshExpiresAt: Date;
    refreshTokenHash: string;
    twitchUserId: string;
  }): Promise<void>;
  createSession(input: {
    expiresAt: Date;
    login: string;
    sessionHash: string;
    twitchUserId: string;
  }): Promise<void>;
  findSession(
    sessionHash: string,
    now: Date,
  ): Promise<{ login: string; twitchUserId: string } | undefined>;
  findExtensionSession(
    accessTokenHash: string,
    now: Date,
  ): Promise<{ login: string; twitchUserId: string } | undefined>;
  rotateExtensionSession(input: {
    accessExpiresAt: Date;
    accessTokenHash: string;
    now: Date;
    refreshExpiresAt: Date;
    refreshTokenHash: string;
    usedRefreshTokenHash: string;
  }): Promise<
    | { status: "invalid" }
    | { status: "reused" }
    | { status: "rotated" }
  >;
}

function extensionSessionMethods(database: PgliteDatabase) {
  return {
    async findExtensionSession(accessTokenHash: string, now: Date) {
      const [session] = await database
        .select({
          login: extensionSessions.login,
          twitchUserId: extensionSessions.twitchUserId,
        })
        .from(extensionSessions)
        .where(
          and(
            eq(extensionSessions.accessTokenHash, accessTokenHash),
            gt(extensionSessions.accessExpiresAt, now),
            isNull(extensionSessions.revokedAt),
          ),
        )
        .limit(1);
      return session;
    },

    async rotateExtensionSession(input: {
      accessExpiresAt: Date;
      accessTokenHash: string;
      now: Date;
      refreshExpiresAt: Date;
      refreshTokenHash: string;
      usedRefreshTokenHash: string;
    }) {
      return database.transaction(async (transaction) => {
        const [current] = await transaction
          .select()
          .from(extensionSessions)
          .where(
            eq(
              extensionSessions.refreshTokenHash,
              input.usedRefreshTokenHash,
            ),
          )
          .limit(1);
        if (!current || current.revokedAt || current.refreshExpiresAt <= input.now) {
          return { status: "invalid" as const };
        }
        if (current.rotatedAt) {
          await transaction
            .update(extensionSessions)
            .set({ revokedAt: input.now })
            .where(eq(extensionSessions.familyId, current.familyId));
          return { status: "reused" as const };
        }
        const [rotated] = await transaction
          .update(extensionSessions)
          .set({ rotatedAt: input.now })
          .where(
            and(
              eq(
                extensionSessions.refreshTokenHash,
                input.usedRefreshTokenHash,
              ),
              isNull(extensionSessions.rotatedAt),
              isNull(extensionSessions.revokedAt),
            ),
          )
          .returning();
        if (!rotated) {
          const [latest] = await transaction
            .select({
              familyId: extensionSessions.familyId,
              rotatedAt: extensionSessions.rotatedAt,
            })
            .from(extensionSessions)
            .where(
              eq(
                extensionSessions.refreshTokenHash,
                input.usedRefreshTokenHash,
              ),
            )
            .limit(1);
          if (latest?.rotatedAt) {
            await transaction
              .update(extensionSessions)
              .set({ revokedAt: input.now })
              .where(eq(extensionSessions.familyId, latest.familyId));
            return { status: "reused" as const };
          }
          return { status: "invalid" as const };
        }
        await transaction.insert(extensionSessions).values({
          accessExpiresAt: input.accessExpiresAt,
          accessTokenHash: input.accessTokenHash,
          familyId: current.familyId,
          login: current.login,
          refreshExpiresAt: input.refreshExpiresAt,
          refreshTokenHash: input.refreshTokenHash,
          twitchUserId: current.twitchUserId,
        });
        return { status: "rotated" as const };
      });
    },
  };
}

function authStoreFromDatabase(database: PgliteDatabase): AuthStore {
  return {
    ...extensionSessionMethods(database),
    async consumeExtensionExchangeCode({ codeChallenge, codeHash, now }) {
      const [code] = await database
        .update(extensionExchangeCodes)
        .set({ consumedAt: now })
        .where(
          and(
            eq(extensionExchangeCodes.codeHash, codeHash),
            eq(extensionExchangeCodes.codeChallenge, codeChallenge),
            gt(extensionExchangeCodes.expiresAt, now),
            isNull(extensionExchangeCodes.consumedAt),
          ),
        )
        .returning({
          login: extensionExchangeCodes.login,
          twitchUserId: extensionExchangeCodes.twitchUserId,
        });
      return code;
    },

    async consumeExtensionOAuthAttempt({ now, stateHash }) {
      const [attempt] = await database
        .update(extensionOAuthAttempts)
        .set({ consumedAt: now })
        .where(
          and(
            eq(extensionOAuthAttempts.stateHash, stateHash),
            gt(extensionOAuthAttempts.expiresAt, now),
            isNull(extensionOAuthAttempts.consumedAt),
          ),
        )
        .returning({
          codeChallenge: extensionOAuthAttempts.codeChallenge,
          redirectUri: extensionOAuthAttempts.redirectUri,
        });
      return attempt;
    },

    async consumeOAuthAttempt({ browserBindingHash, now, stateHash }) {
      const consumed = await database
        .update(oauthAttempts)
        .set({ consumedAt: now })
        .where(
          and(
            eq(oauthAttempts.stateHash, stateHash),
            eq(oauthAttempts.browserBindingHash, browserBindingHash),
            gt(oauthAttempts.expiresAt, now),
            isNull(oauthAttempts.consumedAt),
          ),
        )
        .returning({ stateHash: oauthAttempts.stateHash });

      return consumed.length === 1;
    },

    async createOAuthAttempt(input) {
      await database.insert(oauthAttempts).values(input);
    },

    async createExtensionExchangeCode(input) {
      await database.insert(extensionExchangeCodes).values(input);
    },

    async createExtensionOAuthAttempt(input) {
      await database.insert(extensionOAuthAttempts).values(input);
    },

    async createExtensionSession(input) {
      await database.insert(extensionSessions).values(input);
    },

    async createSession(input) {
      await database.insert(dashboardSessions).values(input);
    },

    async findSession(sessionHash, now) {
      const [session] = await database
        .select({
          login: dashboardSessions.login,
          twitchUserId: dashboardSessions.twitchUserId,
        })
        .from(dashboardSessions)
        .where(
          and(
            eq(dashboardSessions.sessionHash, sessionHash),
            gt(dashboardSessions.expiresAt, now),
          ),
        )
        .limit(1);

      return session;
    },
  };
}

export async function createPgliteAuthStore(
  client: PGlite,
): Promise<AuthStore> {
  const database = drizzle(client);
  await migrate(database, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  });
  return authStoreFromDatabase(database);
}

export function createPostgresAuthStore(connectionString: string): AuthStore {
  const database = drizzlePostgres(postgres(connectionString));

  return {
    async findExtensionSession(accessTokenHash, now) {
      const [session] = await database
        .select({
          login: extensionSessions.login,
          twitchUserId: extensionSessions.twitchUserId,
        })
        .from(extensionSessions)
        .where(
          and(
            eq(extensionSessions.accessTokenHash, accessTokenHash),
            gt(extensionSessions.accessExpiresAt, now),
            isNull(extensionSessions.revokedAt),
          ),
        )
        .limit(1);
      return session;
    },

    async rotateExtensionSession(input) {
      return database.transaction(async (transaction) => {
        const [current] = await transaction
          .select()
          .from(extensionSessions)
          .where(
            eq(
              extensionSessions.refreshTokenHash,
              input.usedRefreshTokenHash,
            ),
          )
          .limit(1);
        if (!current || current.revokedAt || current.refreshExpiresAt <= input.now) {
          return { status: "invalid" as const };
        }
        if (current.rotatedAt) {
          await transaction
            .update(extensionSessions)
            .set({ revokedAt: input.now })
            .where(eq(extensionSessions.familyId, current.familyId));
          return { status: "reused" as const };
        }
        const [rotated] = await transaction
          .update(extensionSessions)
          .set({ rotatedAt: input.now })
          .where(
            and(
              eq(
                extensionSessions.refreshTokenHash,
                input.usedRefreshTokenHash,
              ),
              isNull(extensionSessions.rotatedAt),
              isNull(extensionSessions.revokedAt),
            ),
          )
          .returning();
        if (!rotated) {
          const [latest] = await transaction
            .select({
              familyId: extensionSessions.familyId,
              rotatedAt: extensionSessions.rotatedAt,
            })
            .from(extensionSessions)
            .where(
              eq(
                extensionSessions.refreshTokenHash,
                input.usedRefreshTokenHash,
              ),
            )
            .limit(1);
          if (latest?.rotatedAt) {
            await transaction
              .update(extensionSessions)
              .set({ revokedAt: input.now })
              .where(eq(extensionSessions.familyId, latest.familyId));
            return { status: "reused" as const };
          }
          return { status: "invalid" as const };
        }
        await transaction.insert(extensionSessions).values({
          accessExpiresAt: input.accessExpiresAt,
          accessTokenHash: input.accessTokenHash,
          familyId: current.familyId,
          login: current.login,
          refreshExpiresAt: input.refreshExpiresAt,
          refreshTokenHash: input.refreshTokenHash,
          twitchUserId: current.twitchUserId,
        });
        return { status: "rotated" as const };
      });
    },
    async consumeExtensionExchangeCode({ codeChallenge, codeHash, now }) {
      const [code] = await database
        .update(extensionExchangeCodes)
        .set({ consumedAt: now })
        .where(
          and(
            eq(extensionExchangeCodes.codeHash, codeHash),
            eq(extensionExchangeCodes.codeChallenge, codeChallenge),
            gt(extensionExchangeCodes.expiresAt, now),
            isNull(extensionExchangeCodes.consumedAt),
          ),
        )
        .returning({
          login: extensionExchangeCodes.login,
          twitchUserId: extensionExchangeCodes.twitchUserId,
        });
      return code;
    },

    async consumeExtensionOAuthAttempt({ now, stateHash }) {
      const [attempt] = await database
        .update(extensionOAuthAttempts)
        .set({ consumedAt: now })
        .where(
          and(
            eq(extensionOAuthAttempts.stateHash, stateHash),
            gt(extensionOAuthAttempts.expiresAt, now),
            isNull(extensionOAuthAttempts.consumedAt),
          ),
        )
        .returning({
          codeChallenge: extensionOAuthAttempts.codeChallenge,
          redirectUri: extensionOAuthAttempts.redirectUri,
        });
      return attempt;
    },

    async consumeOAuthAttempt({ browserBindingHash, now, stateHash }) {
      const consumed = await database
        .update(oauthAttempts)
        .set({ consumedAt: now })
        .where(
          and(
            eq(oauthAttempts.stateHash, stateHash),
            eq(oauthAttempts.browserBindingHash, browserBindingHash),
            gt(oauthAttempts.expiresAt, now),
            isNull(oauthAttempts.consumedAt),
          ),
        )
        .returning({ stateHash: oauthAttempts.stateHash });

      return consumed.length === 1;
    },

    async createOAuthAttempt(input) {
      await database.insert(oauthAttempts).values(input);
    },

    async createExtensionExchangeCode(input) {
      await database.insert(extensionExchangeCodes).values(input);
    },

    async createExtensionOAuthAttempt(input) {
      await database.insert(extensionOAuthAttempts).values(input);
    },

    async createExtensionSession(input) {
      await database.insert(extensionSessions).values(input);
    },

    async createSession(input) {
      await database.insert(dashboardSessions).values(input);
    },

    async findSession(sessionHash, now) {
      const [session] = await database
        .select({
          login: dashboardSessions.login,
          twitchUserId: dashboardSessions.twitchUserId,
        })
        .from(dashboardSessions)
        .where(
          and(
            eq(dashboardSessions.sessionHash, sessionHash),
            gt(dashboardSessions.expiresAt, now),
          ),
        )
        .limit(1);

      return session;
    },
  };
}

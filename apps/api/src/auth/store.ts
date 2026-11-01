import { fileURLToPath } from "node:url";

import type { PGlite } from "@electric-sql/pglite";
import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { dashboardSessions, oauthAttempts } from "./schema.ts";

export interface AuthStore {
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
}

function authStoreFromDatabase(database: PgliteDatabase): AuthStore {
  return {
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

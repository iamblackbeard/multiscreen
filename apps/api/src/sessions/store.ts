import { fileURLToPath } from "node:url";

import type { PGlite } from "@electric-sql/pglite";
import type { ActiveMulticamSession } from "@multicam/contracts";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { activeMulticamSessions } from "./schema.ts";

export interface MulticamSessionStore {
  findByChannelLogin(
    channelLogin: string,
  ): Promise<ActiveMulticamSession | undefined>;
  publish(input: {
    broadcasterId: string;
    channelLogin: string;
    snapshot: ActiveMulticamSession;
  }): Promise<ActiveMulticamSession>;
}

function sessionStoreFromDatabase(
  database: PgliteDatabase,
): MulticamSessionStore {
  return {
    async findByChannelLogin(channelLogin) {
      const [session] = await database
        .select({ snapshot: activeMulticamSessions.snapshot })
        .from(activeMulticamSessions)
        .where(eq(activeMulticamSessions.channelLogin, channelLogin))
        .limit(1);
      return session?.snapshot;
    },
    async publish(input) {
      const [session] = await database
        .insert(activeMulticamSessions)
        .values(input)
        .onConflictDoUpdate({
          set: {
            channelLogin: input.channelLogin,
            snapshot: input.snapshot,
          },
          target: activeMulticamSessions.broadcasterId,
        })
        .returning({ snapshot: activeMulticamSessions.snapshot });
      if (!session) throw new Error("Session publication returned no row");
      return session.snapshot;
    },
  };
}

export async function createPgliteMulticamSessionStore(
  client: PGlite,
): Promise<MulticamSessionStore> {
  const database = drizzle(client);
  await migrate(database, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  });
  return sessionStoreFromDatabase(database);
}

export function createPostgresMulticamSessionStore(
  connectionString: string,
): MulticamSessionStore {
  const database = drizzlePostgres(postgres(connectionString));
  return {
    async findByChannelLogin(channelLogin) {
      const [session] = await database
        .select({ snapshot: activeMulticamSessions.snapshot })
        .from(activeMulticamSessions)
        .where(eq(activeMulticamSessions.channelLogin, channelLogin))
        .limit(1);
      return session?.snapshot;
    },
    async publish(input) {
      const [session] = await database
        .insert(activeMulticamSessions)
        .values(input)
        .onConflictDoUpdate({
          set: {
            channelLogin: input.channelLogin,
            snapshot: input.snapshot,
          },
          target: activeMulticamSessions.broadcasterId,
        })
        .returning({ snapshot: activeMulticamSessions.snapshot });
      if (!session) throw new Error("Session publication returned no row");
      return session.snapshot;
    },
  };
}

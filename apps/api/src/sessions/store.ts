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
  disable(broadcasterId: string): Promise<void>;
  findByBroadcasterId(
    broadcasterId: string,
  ): Promise<
    | {
        broadcasterId: string;
        snapshot: ActiveMulticamSession;
        streamId: string | null;
      }
    | undefined
  >;
  findByChannelLogin(
    channelLogin: string,
  ): Promise<
    | {
        broadcasterId: string;
        snapshot: ActiveMulticamSession;
        streamId: string | null;
      }
    | undefined
  >;
  publish(input: {
    broadcasterId: string;
    channelLogin: string;
    snapshot: ActiveMulticamSession;
    streamId: string;
  }): Promise<ActiveMulticamSession>;
  publishDraft(input: {
    broadcasterId: string;
    cameras: ActiveMulticamSession["cameras"];
    mainSlot: ActiveMulticamSession["mainSlot"];
  }): Promise<ActiveMulticamSession | undefined>;
}

function sessionStoreFromDatabase(
  database: PgliteDatabase,
): MulticamSessionStore {
  return {
    async disable(broadcasterId) {
      await database
        .delete(activeMulticamSessions)
        .where(eq(activeMulticamSessions.broadcasterId, broadcasterId));
    },
    async findByBroadcasterId(broadcasterId) {
      const [session] = await database
        .select({
          broadcasterId: activeMulticamSessions.broadcasterId,
          snapshot: activeMulticamSessions.snapshot,
          streamId: activeMulticamSessions.streamId,
        })
        .from(activeMulticamSessions)
        .where(eq(activeMulticamSessions.broadcasterId, broadcasterId))
        .limit(1);
      return session;
    },
    async findByChannelLogin(channelLogin) {
      const [session] = await database
        .select({
          broadcasterId: activeMulticamSessions.broadcasterId,
          snapshot: activeMulticamSessions.snapshot,
          streamId: activeMulticamSessions.streamId,
        })
        .from(activeMulticamSessions)
        .where(eq(activeMulticamSessions.channelLogin, channelLogin))
        .limit(1);
      return session;
    },
    async publish(input) {
      const [session] = await database
        .insert(activeMulticamSessions)
        .values(input)
        .onConflictDoUpdate({
          set: {
            channelLogin: input.channelLogin,
            snapshot: input.snapshot,
            streamId: input.streamId,
          },
          target: activeMulticamSessions.broadcasterId,
        })
        .returning({ snapshot: activeMulticamSessions.snapshot });
      if (!session) throw new Error("Session publication returned no row");
      return session.snapshot;
    },
    async publishDraft(input) {
      return database.transaction(async (transaction) => {
        const [current] = await transaction
          .select({ snapshot: activeMulticamSessions.snapshot })
          .from(activeMulticamSessions)
          .where(eq(activeMulticamSessions.broadcasterId, input.broadcasterId))
          .limit(1)
          .for("update");
        if (!current) return undefined;
        const snapshot = {
          ...current.snapshot,
          cameras: input.cameras,
          mainSlot: input.mainSlot,
          revision: current.snapshot.revision + 1,
        };
        const [published] = await transaction
          .update(activeMulticamSessions)
          .set({ snapshot })
          .where(eq(activeMulticamSessions.broadcasterId, input.broadcasterId))
          .returning({ snapshot: activeMulticamSessions.snapshot });
        return published?.snapshot;
      });
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
    async disable(broadcasterId) {
      await database
        .delete(activeMulticamSessions)
        .where(eq(activeMulticamSessions.broadcasterId, broadcasterId));
    },
    async findByBroadcasterId(broadcasterId) {
      const [session] = await database
        .select({
          broadcasterId: activeMulticamSessions.broadcasterId,
          snapshot: activeMulticamSessions.snapshot,
          streamId: activeMulticamSessions.streamId,
        })
        .from(activeMulticamSessions)
        .where(eq(activeMulticamSessions.broadcasterId, broadcasterId))
        .limit(1);
      return session;
    },
    async findByChannelLogin(channelLogin) {
      const [session] = await database
        .select({
          broadcasterId: activeMulticamSessions.broadcasterId,
          snapshot: activeMulticamSessions.snapshot,
          streamId: activeMulticamSessions.streamId,
        })
        .from(activeMulticamSessions)
        .where(eq(activeMulticamSessions.channelLogin, channelLogin))
        .limit(1);
      return session;
    },
    async publish(input) {
      const [session] = await database
        .insert(activeMulticamSessions)
        .values(input)
        .onConflictDoUpdate({
          set: {
            channelLogin: input.channelLogin,
            snapshot: input.snapshot,
            streamId: input.streamId,
          },
          target: activeMulticamSessions.broadcasterId,
        })
        .returning({ snapshot: activeMulticamSessions.snapshot });
      if (!session) throw new Error("Session publication returned no row");
      return session.snapshot;
    },
    async publishDraft(input) {
      return database.transaction(async (transaction) => {
        const [current] = await transaction
          .select({ snapshot: activeMulticamSessions.snapshot })
          .from(activeMulticamSessions)
          .where(eq(activeMulticamSessions.broadcasterId, input.broadcasterId))
          .limit(1)
          .for("update");
        if (!current) return undefined;
        const snapshot = {
          ...current.snapshot,
          cameras: input.cameras,
          mainSlot: input.mainSlot,
          revision: current.snapshot.revision + 1,
        };
        const [published] = await transaction
          .update(activeMulticamSessions)
          .set({ snapshot })
          .where(eq(activeMulticamSessions.broadcasterId, input.broadcasterId))
          .returning({ snapshot: activeMulticamSessions.snapshot });
        return published?.snapshot;
      });
    },
  };
}

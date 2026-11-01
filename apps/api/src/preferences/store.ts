import { fileURLToPath } from "node:url";

import type { PGlite } from "@electric-sql/pglite";
import type { StreamerPreferences } from "@multicam/contracts";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { streamerPreferences } from "./schema.ts";

export interface PreferenceStore {
  find(twitchUserId: string): Promise<StreamerPreferences | undefined>;
  save(
    twitchUserId: string,
    preferences: StreamerPreferences,
  ): Promise<StreamerPreferences>;
}

function preferenceStoreFromDatabase(
  database: PgliteDatabase,
): PreferenceStore {
  return {
    async find(twitchUserId) {
      const [saved] = await database
        .select({ preferences: streamerPreferences.preferences })
        .from(streamerPreferences)
        .where(eq(streamerPreferences.twitchUserId, twitchUserId))
        .limit(1);
      return saved?.preferences;
    },

    async save(twitchUserId, preferences) {
      const [saved] = await database
        .insert(streamerPreferences)
        .values({ preferences, twitchUserId })
        .onConflictDoUpdate({
          set: { preferences },
          target: streamerPreferences.twitchUserId,
        })
        .returning({ preferences: streamerPreferences.preferences });
      if (!saved) throw new Error("Preference save returned no row");
      return saved.preferences;
    },
  };
}

export async function createPglitePreferenceStore(
  client: PGlite,
): Promise<PreferenceStore> {
  const database = drizzle(client);
  await migrate(database, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  });
  return preferenceStoreFromDatabase(database);
}

export function createPostgresPreferenceStore(
  connectionString: string,
): PreferenceStore {
  const database = drizzlePostgres(postgres(connectionString));
  return {
    async find(twitchUserId) {
      const [saved] = await database
        .select({ preferences: streamerPreferences.preferences })
        .from(streamerPreferences)
        .where(eq(streamerPreferences.twitchUserId, twitchUserId))
        .limit(1);
      return saved?.preferences;
    },
    async save(twitchUserId, preferences) {
      const [saved] = await database
        .insert(streamerPreferences)
        .values({ preferences, twitchUserId })
        .onConflictDoUpdate({
          set: { preferences },
          target: streamerPreferences.twitchUserId,
        })
        .returning({ preferences: streamerPreferences.preferences });
      if (!saved) throw new Error("Preference save returned no row");
      return saved.preferences;
    },
  };
}

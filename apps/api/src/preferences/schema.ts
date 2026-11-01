import type { StreamerPreferences } from "@multicam/contracts";
import { jsonb, pgTable, text } from "drizzle-orm/pg-core";

export const streamerPreferences = pgTable("streamer_preferences", {
  preferences: jsonb("preferences").$type<StreamerPreferences>().notNull(),
  twitchUserId: text("twitch_user_id").primaryKey(),
});

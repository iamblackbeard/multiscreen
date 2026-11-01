import type { ActiveMulticamSession } from "@multicam/contracts";
import { jsonb, pgTable, text } from "drizzle-orm/pg-core";

export const activeMulticamSessions = pgTable("active_multicam_sessions", {
  broadcasterId: text("broadcaster_id").primaryKey(),
  channelLogin: text("channel_login").notNull().unique(),
  snapshot: jsonb("snapshot").$type<ActiveMulticamSession>().notNull(),
});

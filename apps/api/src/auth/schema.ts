import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const oauthAttempts = pgTable("oauth_attempts", {
  browserBindingHash: text("browser_binding_hash").notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  stateHash: text("state_hash").primaryKey(),
});

export const dashboardSessions = pgTable("dashboard_sessions", {
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  login: text("login").notNull(),
  sessionHash: text("session_hash").primaryKey(),
  twitchUserId: text("twitch_user_id").notNull(),
});

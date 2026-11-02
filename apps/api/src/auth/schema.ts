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

export const extensionOAuthAttempts = pgTable("extension_oauth_attempts", {
  codeChallenge: text("code_challenge").notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  redirectUri: text("redirect_uri").notNull(),
  stateHash: text("state_hash").primaryKey(),
});

export const extensionExchangeCodes = pgTable("extension_exchange_codes", {
  codeChallenge: text("code_challenge").notNull(),
  codeHash: text("code_hash").primaryKey(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  login: text("login").notNull(),
  twitchUserId: text("twitch_user_id").notNull(),
});

export const extensionSessions = pgTable("extension_sessions", {
  accessExpiresAt: timestamp("access_expires_at", {
    withTimezone: true,
  }).notNull(),
  accessTokenHash: text("access_token_hash").notNull().unique(),
  familyId: text("family_id").notNull(),
  login: text("login").notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  refreshExpiresAt: timestamp("refresh_expires_at", {
    withTimezone: true,
  }).notNull(),
  refreshTokenHash: text("refresh_token_hash").primaryKey(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  twitchUserId: text("twitch_user_id").notNull(),
});

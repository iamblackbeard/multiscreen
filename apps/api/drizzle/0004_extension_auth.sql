CREATE TABLE "extension_oauth_attempts" (
	"code_challenge" text NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"redirect_uri" text NOT NULL,
	"state_hash" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extension_exchange_codes" (
	"code_challenge" text NOT NULL,
	"code_hash" text PRIMARY KEY NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"login" text NOT NULL,
	"twitch_user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extension_sessions" (
	"access_expires_at" timestamp with time zone NOT NULL,
	"access_token_hash" text NOT NULL UNIQUE,
	"family_id" text NOT NULL,
	"login" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"refresh_expires_at" timestamp with time zone NOT NULL,
	"refresh_token_hash" text PRIMARY KEY NOT NULL,
	"rotated_at" timestamp with time zone,
	"twitch_user_id" text NOT NULL
);

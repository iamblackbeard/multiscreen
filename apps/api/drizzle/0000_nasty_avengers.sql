CREATE TABLE "dashboard_sessions" (
	"expires_at" timestamp with time zone NOT NULL,
	"login" text NOT NULL,
	"session_hash" text PRIMARY KEY NOT NULL,
	"twitch_user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_attempts" (
	"browser_binding_hash" text NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"state_hash" text PRIMARY KEY NOT NULL
);

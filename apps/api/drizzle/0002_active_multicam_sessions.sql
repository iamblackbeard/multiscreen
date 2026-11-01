CREATE TABLE "active_multicam_sessions" (
	"broadcaster_id" text PRIMARY KEY NOT NULL,
	"channel_login" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "active_multicam_sessions_channel_login_unique" UNIQUE("channel_login")
);

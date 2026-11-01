import type { AuthDependencies } from "./auth.ts";
import { createPostgresAuthStore } from "./store.ts";
import { createTwitchAuthClient } from "./twitch.ts";

const requiredSettings = [
  "DATABASE_URL",
  "DASHBOARD_URL",
  "TWITCH_CALLBACK_URL",
  "TWITCH_CLIENT_ID",
  "TWITCH_CLIENT_SECRET",
] as const;

export function authDependenciesFromEnvironment(
  environment: NodeJS.ProcessEnv,
): AuthDependencies | undefined {
  const configuredSettings = requiredSettings.filter(
    (setting) => environment[setting] !== undefined,
  );
  if (configuredSettings.length === 0) return undefined;

  const missingSettings = requiredSettings.filter(
    (setting) => !environment[setting],
  );
  if (missingSettings.length > 0) {
    throw new Error(
      `Incomplete authentication configuration: missing ${missingSettings.join(", ")}`,
    );
  }

  return {
    authConfig: {
      callbackUrl: environment.TWITCH_CALLBACK_URL!,
      dashboardUrl: environment.DASHBOARD_URL!,
      oauthStateTtlMs: 10 * 60 * 1_000,
      secureCookies: environment.NODE_ENV === "production",
      sessionTtlMs: 24 * 60 * 60 * 1_000,
      twitchClientId: environment.TWITCH_CLIENT_ID!,
      twitchClientSecret: environment.TWITCH_CLIENT_SECRET!,
    },
    authStore: createPostgresAuthStore(environment.DATABASE_URL!),
    twitch: createTwitchAuthClient(),
  };
}

import type { AuthDependencies } from "./auth.ts";
import { createPostgresAuthStore } from "./store.ts";
import { createTwitchAuthClient } from "./twitch.ts";

const requiredSettings = [
  "DATABASE_URL",
  "DASHBOARD_URL",
  "EXTENSION_REDIRECT_ORIGINS",
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
      extensionAccessTokenTtlMs: 15 * 60 * 1_000,
      extensionCallbackUrl:
        environment.TWITCH_EXTENSION_CALLBACK_URL ??
        new URL(
          "/auth/extension/twitch/callback",
          environment.TWITCH_CALLBACK_URL!,
        ).toString(),
      extensionExchangeCodeTtlMs: 60 * 1_000,
      extensionRedirectOrigins: (
        environment.EXTENSION_REDIRECT_ORIGINS ?? ""
      )
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
      extensionRefreshTokenTtlMs: 7 * 24 * 60 * 60 * 1_000,
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

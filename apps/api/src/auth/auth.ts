import { createHash, randomBytes } from "node:crypto";

import { dashboardSessionResponseSchema } from "@multicam/contracts";
import type { Request, Response } from "express";

import type { AuthStore } from "./store.ts";

const OAUTH_COOKIE = "multicam_oauth";
const SESSION_COOKIE = "multicam_session";

export interface AuthConfig {
  callbackUrl: string;
  dashboardUrl: string;
  oauthStateTtlMs: number;
  secureCookies: boolean;
  sessionTtlMs: number;
  twitchClientId: string;
  twitchClientSecret: string;
}

export interface TwitchAuthClient {
  exchangeCode(input: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
  }): Promise<{ accessToken: string; refreshToken: string }>;
  validateAccessToken(accessToken: string): Promise<{
    clientId: string;
    login: string;
    twitchUserId: string;
  }>;
}

export interface AuthDependencies {
  authConfig: AuthConfig;
  authStore: AuthStore;
  twitch: TwitchAuthClient;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function cookies(request: Request) {
  return Object.fromEntries(
    (request.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim().split("=", 2))
      .filter((pair): pair is [string, string] => pair.length === 2),
  );
}

function cookieOptions(config: AuthConfig, maxAgeMs: number) {
  return {
    httpOnly: true,
    maxAge: maxAgeMs,
    path: "/",
    sameSite: "lax" as const,
    secure: config.secureCookies,
  };
}

export function createAuthHandlers({
  authConfig,
  authStore,
  twitch,
}: AuthDependencies) {
  return {
    async begin(_request: Request, response: Response) {
      const state = randomToken();
      const browserBinding = randomToken();
      await authStore.createOAuthAttempt({
        browserBindingHash: hash(browserBinding),
        expiresAt: new Date(Date.now() + authConfig.oauthStateTtlMs),
        stateHash: hash(state),
      });
      response.cookie(
        OAUTH_COOKIE,
        browserBinding,
        cookieOptions(authConfig, authConfig.oauthStateTtlMs),
      );

      const authorizationUrl = new URL(
        "https://id.twitch.tv/oauth2/authorize",
      );
      authorizationUrl.searchParams.set("client_id", authConfig.twitchClientId);
      authorizationUrl.searchParams.set("redirect_uri", authConfig.callbackUrl);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("scope", "openid");
      authorizationUrl.searchParams.set("state", state);
      response.redirect(authorizationUrl.toString());
    },

    async callback(request: Request, response: Response) {
      const code = typeof request.query.code === "string" ? request.query.code : "";
      const state =
        typeof request.query.state === "string" ? request.query.state : "";
      const browserBinding = cookies(request)[OAUTH_COOKIE] ?? "";
      const validAttempt = await authStore.consumeOAuthAttempt({
        browserBindingHash: hash(browserBinding),
        now: new Date(),
        stateHash: hash(state),
      });

      if (!code || !state || !browserBinding || !validAttempt) {
        response.status(400).json({
          code: "INVALID_OAUTH_STATE",
          message: "The Twitch sign-in attempt is invalid or expired.",
        });
        return;
      }

      let credentials: Awaited<ReturnType<TwitchAuthClient["exchangeCode"]>>;
      try {
        credentials = await twitch.exchangeCode({
          clientId: authConfig.twitchClientId,
          clientSecret: authConfig.twitchClientSecret,
          code,
          redirectUri: authConfig.callbackUrl,
        });
      } catch {
        response.status(502).json({
          code: "TWITCH_EXCHANGE_FAILED",
          message: "Twitch could not complete sign-in. Please try again.",
        });
        return;
      }
      let identity: Awaited<
        ReturnType<TwitchAuthClient["validateAccessToken"]>
      >;
      try {
        identity = await twitch.validateAccessToken(credentials.accessToken);
      } catch {
        response.status(502).json({
          code: "TWITCH_VALIDATION_FAILED",
          message: "Twitch could not validate sign-in. Please try again.",
        });
        return;
      }
      if (
        identity.clientId !== authConfig.twitchClientId ||
        !/^\d+$/.test(identity.twitchUserId)
      ) {
        response.status(401).json({
          code: "INVALID_TWITCH_CREDENTIALS",
          message: "Twitch returned credentials for another application.",
        });
        return;
      }

      const sessionToken = randomToken();
      await authStore.createSession({
        expiresAt: new Date(Date.now() + authConfig.sessionTtlMs),
        login: identity.login,
        sessionHash: hash(sessionToken),
        twitchUserId: identity.twitchUserId,
      });
      response.clearCookie(OAUTH_COOKIE, {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: authConfig.secureCookies,
      });
      response.cookie(
        SESSION_COOKIE,
        sessionToken,
        cookieOptions(authConfig, authConfig.sessionTtlMs),
      );
      response.redirect(authConfig.dashboardUrl);
    },

    async session(request: Request, response: Response) {
      const sessionToken = cookies(request)[SESSION_COOKIE];
      const session = sessionToken
        ? await authStore.findSession(hash(sessionToken), new Date())
        : undefined;

      if (!session) {
        response.status(401).json({
          code: "NOT_AUTHENTICATED",
          message: "Sign in with Twitch to continue.",
        });
        return;
      }

      response.json(
        dashboardSessionResponseSchema.parse({
          authenticated: true,
          streamer: session,
        }),
      );
    },
  };
}

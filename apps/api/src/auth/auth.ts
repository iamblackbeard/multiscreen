import { createHash, randomBytes } from "node:crypto";

import { dashboardSessionResponseSchema } from "@multicam/contracts";
import type { Request, Response } from "express";

import type { AuthStore } from "./store.ts";

const OAUTH_COOKIE = "multicam_oauth";
const SESSION_COOKIE = "multicam_session";

export interface AuthConfig {
  callbackUrl: string;
  dashboardUrl: string;
  extensionAccessTokenTtlMs: number;
  extensionCallbackUrl: string;
  extensionExchangeCodeTtlMs: number;
  extensionRedirectOrigins: string[];
  extensionRefreshTokenTtlMs: number;
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
  now?: () => Date;
  twitch: TwitchAuthClient;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function codeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function stringQuery(value: unknown) {
  return typeof value === "string" ? value : "";
}

function allowedExtensionRedirect(redirectUri: string, config: AuthConfig) {
  try {
    return config.extensionRedirectOrigins.includes(new URL(redirectUri).origin);
  } catch {
    return false;
  }
}

function cookies(request: Request) {
  return Object.fromEntries(
    (request.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim().split("=", 2))
      .filter((pair): pair is [string, string] => pair.length === 2),
  );
}

export async function authenticatedStreamer(
  request: Request,
  authStore: AuthStore,
  currentTime = new Date(),
) {
  const authorization = request.get("Authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    return authStore.findExtensionSession(
      hash(authorization.slice("Bearer ".length)),
      currentTime,
    );
  }
  const sessionToken = cookies(request)[SESSION_COOKIE];
  return sessionToken
    ? authStore.findSession(hash(sessionToken), currentTime)
    : undefined;
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
  now = () => new Date(),
  twitch,
}: AuthDependencies) {
  const authorizationUrl = (state: string, redirectUri: string) => {
    const url = new URL("https://id.twitch.tv/oauth2/authorize");
    url.searchParams.set("client_id", authConfig.twitchClientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid");
    url.searchParams.set("state", state);
    return url;
  };

  const twitchIdentity = async (
    code: string,
    redirectUri: string,
    response: Response,
  ) => {
    let credentials: Awaited<ReturnType<TwitchAuthClient["exchangeCode"]>>;
    try {
      credentials = await twitch.exchangeCode({
        clientId: authConfig.twitchClientId,
        clientSecret: authConfig.twitchClientSecret,
        code,
        redirectUri,
      });
    } catch {
      response.status(502).json({
        code: "TWITCH_EXCHANGE_FAILED",
        message: "Twitch could not complete sign-in. Please try again.",
      });
      return undefined;
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
      return undefined;
    }
    if (
      identity.clientId !== authConfig.twitchClientId ||
      !/^\d+$/.test(identity.twitchUserId)
    ) {
      response.status(401).json({
        code: "INVALID_TWITCH_CREDENTIALS",
        message: "Twitch returned credentials for another application.",
      });
      return undefined;
    }
    return identity;
  };

  const applicationCredentials = (
    response: Response,
    accessToken: string,
    refreshToken: string,
  ) =>
    response.json({
      accessToken,
      expiresIn: authConfig.extensionAccessTokenTtlMs / 1_000,
      refreshToken,
    });

  return {
    async beginExtension(request: Request, response: Response) {
      const redirectUri = stringQuery(request.query.redirect_uri);
      const challenge = stringQuery(request.query.code_challenge);
      if (
        !allowedExtensionRedirect(redirectUri, authConfig) ||
        !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)
      ) {
        response.status(400).json({
          code: "INVALID_EXTENSION_AUTH_ATTEMPT",
          message: "The extension sign-in request is invalid.",
        });
        return;
      }

      const state = randomToken();
      await authStore.createExtensionOAuthAttempt({
        codeChallenge: challenge,
        expiresAt: new Date(now().getTime() + authConfig.oauthStateTtlMs),
        redirectUri,
        stateHash: hash(state),
      });
      response.redirect(
        authorizationUrl(state, authConfig.extensionCallbackUrl).toString(),
      );
    },

    async extensionCallback(request: Request, response: Response) {
      const code = stringQuery(request.query.code);
      const state = stringQuery(request.query.state);
      const attempt = state
        ? await authStore.consumeExtensionOAuthAttempt({
            now: now(),
            stateHash: hash(state),
          })
        : undefined;
      if (!code || !attempt) {
        response.status(400).json({
          code: "INVALID_OAUTH_STATE",
          message: "The Twitch sign-in attempt is invalid or expired.",
        });
        return;
      }

      const identity = await twitchIdentity(
        code,
        authConfig.extensionCallbackUrl,
        response,
      );
      if (!identity) return;

      const exchangeCode = randomToken();
      await authStore.createExtensionExchangeCode({
        codeChallenge: attempt.codeChallenge,
        codeHash: hash(exchangeCode),
        expiresAt: new Date(
          now().getTime() + authConfig.extensionExchangeCodeTtlMs,
        ),
        login: identity.login,
        twitchUserId: identity.twitchUserId,
      });
      const redirect = new URL(attempt.redirectUri);
      redirect.searchParams.set("code", exchangeCode);
      response.redirect(redirect.toString());
    },

    async exchangeExtensionCode(request: Request, response: Response) {
      const code = stringQuery(request.body?.code);
      const verifier = stringQuery(request.body?.codeVerifier);
      const identity =
        code && verifier
          ? await authStore.consumeExtensionExchangeCode({
              codeChallenge: codeChallenge(verifier),
              codeHash: hash(code),
              now: now(),
            })
          : undefined;
      if (!identity) {
        response.status(400).json({
          code: "INVALID_EXCHANGE_CODE",
          message: "The extension exchange code is invalid or expired.",
        });
        return;
      }

      const accessToken = randomToken();
      const refreshToken = randomToken();
      await authStore.createExtensionSession({
        accessExpiresAt: new Date(
          now().getTime() + authConfig.extensionAccessTokenTtlMs,
        ),
        accessTokenHash: hash(accessToken),
        familyId: randomToken(),
        login: identity.login,
        refreshExpiresAt: new Date(
          now().getTime() + authConfig.extensionRefreshTokenTtlMs,
        ),
        refreshTokenHash: hash(refreshToken),
        twitchUserId: identity.twitchUserId,
      });
      applicationCredentials(response, accessToken, refreshToken);
    },

    async refreshExtensionSession(request: Request, response: Response) {
      const usedRefreshToken = stringQuery(request.body?.refreshToken);
      if (!usedRefreshToken) {
        response.status(401).json({
          code: "INVALID_REFRESH_TOKEN",
          message: "The extension refresh token is invalid or expired.",
        });
        return;
      }
      const accessToken = randomToken();
      const refreshToken = randomToken();
      const result = await authStore.rotateExtensionSession({
        accessExpiresAt: new Date(
          now().getTime() + authConfig.extensionAccessTokenTtlMs,
        ),
        accessTokenHash: hash(accessToken),
        now: now(),
        refreshExpiresAt: new Date(
          now().getTime() + authConfig.extensionRefreshTokenTtlMs,
        ),
        refreshTokenHash: hash(refreshToken),
        usedRefreshTokenHash: hash(usedRefreshToken),
      });
      if (result.status !== "rotated") {
        response.status(401).json({
          code:
            result.status === "reused"
              ? "REFRESH_TOKEN_REUSE"
              : "INVALID_REFRESH_TOKEN",
          message:
            result.status === "reused"
              ? "Refresh token reuse revoked this extension session."
              : "The extension refresh token is invalid or expired.",
        });
        return;
      }
      applicationCredentials(response, accessToken, refreshToken);
    },

    async begin(_request: Request, response: Response) {
      const state = randomToken();
      const browserBinding = randomToken();
      await authStore.createOAuthAttempt({
        browserBindingHash: hash(browserBinding),
        expiresAt: new Date(now().getTime() + authConfig.oauthStateTtlMs),
        stateHash: hash(state),
      });
      response.cookie(
        OAUTH_COOKIE,
        browserBinding,
        cookieOptions(authConfig, authConfig.oauthStateTtlMs),
      );

      response.redirect(authorizationUrl(state, authConfig.callbackUrl).toString());
    },

    async callback(request: Request, response: Response) {
      const code = typeof request.query.code === "string" ? request.query.code : "";
      const state =
        typeof request.query.state === "string" ? request.query.state : "";
      const browserBinding = cookies(request)[OAUTH_COOKIE] ?? "";
      const validAttempt = await authStore.consumeOAuthAttempt({
        browserBindingHash: hash(browserBinding),
        now: now(),
        stateHash: hash(state),
      });

      if (!code || !state || !browserBinding || !validAttempt) {
        response.status(400).json({
          code: "INVALID_OAUTH_STATE",
          message: "The Twitch sign-in attempt is invalid or expired.",
        });
        return;
      }

      const identity = await twitchIdentity(
        code,
        authConfig.callbackUrl,
        response,
      );
      if (!identity) return;

      const sessionToken = randomToken();
      await authStore.createSession({
        expiresAt: new Date(now().getTime() + authConfig.sessionTtlMs),
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
      const session = await authenticatedStreamer(request, authStore, now());

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

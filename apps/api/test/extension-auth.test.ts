import { createHash } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import { createApi } from "../src/app.ts";
import { createPgliteAuthStore } from "../src/auth/store.ts";

const openApis: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(openApis.splice(0).map((api) => api.close()));
});

function challengeFor(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function applicationCredentials(response: Response) {
  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("accessToken" in payload) ||
    typeof payload.accessToken !== "string" ||
    !("refreshToken" in payload) ||
    typeof payload.refreshToken !== "string"
  ) {
    throw new Error("Expected application credentials");
  }
  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
  };
}

async function startTestApi(now = () => new Date()) {
  const database = new PGlite();
  const authStore = await createPgliteAuthStore(database);
  const api = createApi({
    authConfig: {
      callbackUrl: "https://api.multicam.test/auth/twitch/callback",
      dashboardUrl: "https://dashboard.multicam.test/",
      extensionAccessTokenTtlMs: 15 * 60 * 1_000,
      extensionCallbackUrl:
        "https://api.multicam.test/auth/extension/twitch/callback",
      extensionExchangeCodeTtlMs: 60 * 1_000,
      extensionRedirectOrigins: ["https://extension.multicam.test"],
      extensionRefreshTokenTtlMs: 7 * 24 * 60 * 60 * 1_000,
      oauthStateTtlMs: 10 * 60 * 1_000,
      secureCookies: true,
      sessionTtlMs: 24 * 60 * 60 * 1_000,
      twitchClientId: "multicam-client",
      twitchClientSecret: "server-only-secret",
    },
    authStore,
    now,
    twitch: {
      async exchangeCode() {
        return {
          accessToken: "server-only-twitch-access-token",
          refreshToken: "server-only-twitch-refresh-token",
        };
      },
      async validateAccessToken() {
        return {
          clientId: "multicam-client",
          login: "camera_captain",
          twitchUserId: "141981764",
        };
      },
    },
  });
  const server = api.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const testApi = {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      server.close();
      await database.close();
    },
  };
  openApis.push(testApi);
  return testApi;
}

async function signInExtension(
  baseUrl: string,
  exchangeVerifier = "a".repeat(64),
) {
  const verifier = "a".repeat(64);
  const redirectUri = "https://extension.multicam.test/callback";
  const begin = await fetch(
    `${baseUrl}/auth/extension/twitch?redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${challengeFor(verifier)}`,
    { redirect: "manual" },
  );
  const twitchAuthorization = new URL(begin.headers.get("location") ?? "");
  const callback = await fetch(
    `${baseUrl}/auth/extension/twitch/callback?code=twitch-code&state=${twitchAuthorization.searchParams.get("state")}`,
    { redirect: "manual" },
  );
  const extensionRedirect = new URL(callback.headers.get("location") ?? "");
  const exchangeCode = extensionRedirect.searchParams.get("code");
  const exchange = await fetch(`${baseUrl}/api/extension-auth/exchange`, {
    body: JSON.stringify({
      code: exchangeCode,
      codeVerifier: exchangeVerifier,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return {
    begin,
    callback,
    exchange,
    exchangeCode,
    twitchAuthorization,
  };
}

describe("extension authentication", () => {
  it("exchanges a browser-bound code once for application credentials", async () => {
    const testApi = await startTestApi();
    const {
      begin,
      callback,
      exchange: firstExchange,
      exchangeCode,
      twitchAuthorization,
    } = await signInExtension(testApi.baseUrl);
    expect(begin.status).toBe(302);
    expect(twitchAuthorization.origin).toBe("https://id.twitch.tv");
    const extensionRedirect = new URL(callback.headers.get("location") ?? "");
    expect(callback.status).toBe(302);
    expect(extensionRedirect.origin).toBe("https://extension.multicam.test");
    expect(exchangeCode).toBeTruthy();

    const exchange = () =>
      fetch(`${testApi.baseUrl}/api/extension-auth/exchange`, {
        body: JSON.stringify({
          code: exchangeCode,
          codeVerifier: "a".repeat(64),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
    expect(firstExchange.status).toBe(200);
    const credentials = await firstExchange.json();
    expect(credentials).toMatchObject({
      accessToken: expect.any(String),
      expiresIn: 15 * 60,
      refreshToken: expect.any(String),
    });
    expect(JSON.stringify(credentials)).not.toContain("twitch");
    expect(JSON.stringify(credentials)).not.toContain("server-only-secret");

    const reusedExchange = await exchange();
    expect(reusedExchange.status).toBe(400);
    expect(await reusedExchange.json()).toMatchObject({
      code: "INVALID_EXCHANGE_CODE",
    });
  });

  it("revokes a session family when a rotated refresh token is reused", async () => {
    const testApi = await startTestApi();
    const { exchange } = await signInExtension(testApi.baseUrl);
    const firstCredentials = await applicationCredentials(exchange);

    const refresh = (refreshToken: string) =>
      fetch(`${testApi.baseUrl}/api/extension-auth/refresh`, {
        body: JSON.stringify({ refreshToken }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
    const rotation = await refresh(firstCredentials.refreshToken);
    expect(rotation.status).toBe(200);
    const rotatedCredentials = await applicationCredentials(rotation);
    expect(rotatedCredentials.refreshToken).not.toBe(
      firstCredentials.refreshToken,
    );

    const reuse = await refresh(firstCredentials.refreshToken);
    expect(reuse.status).toBe(401);
    expect(await reuse.json()).toMatchObject({
      code: "REFRESH_TOKEN_REUSE",
    });

    const session = await fetch(`${testApi.baseUrl}/api/auth/session`, {
      headers: {
        Authorization: `Bearer ${rotatedCredentials.accessToken}`,
      },
    });
    expect(session.status).toBe(401);
  });

  it("rejects an exchange code presented without its initiating verifier", async () => {
    const testApi = await startTestApi();
    const { exchange } = await signInExtension(
      testApi.baseUrl,
      "b".repeat(64),
    );

    expect(exchange.status).toBe(400);
    expect(await exchange.json()).toMatchObject({
      code: "INVALID_EXCHANGE_CODE",
    });
  });

  it("expires refresh access after seven days of inactivity", async () => {
    let currentTime = new Date("2026-01-01T00:00:00.000Z");
    const testApi = await startTestApi(() => currentTime);
    const { exchange } = await signInExtension(testApi.baseUrl);
    let credentials = await applicationCredentials(exchange);

    const refresh = (refreshToken: string) =>
      fetch(`${testApi.baseUrl}/api/extension-auth/refresh`, {
        body: JSON.stringify({ refreshToken }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

    currentTime = new Date("2026-01-07T00:00:00.000Z");
    const firstActivity = await refresh(credentials.refreshToken);
    expect(firstActivity.status).toBe(200);
    credentials = await applicationCredentials(firstActivity);

    currentTime = new Date("2026-01-13T00:00:00.000Z");
    const secondActivity = await refresh(credentials.refreshToken);
    expect(secondActivity.status).toBe(200);
    credentials = await applicationCredentials(secondActivity);

    currentTime = new Date("2026-01-21T00:00:00.000Z");
    const inactive = await refresh(credentials.refreshToken);
    expect(inactive.status).toBe(401);
    expect(await inactive.json()).toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("expires application access tokens after 15 minutes", async () => {
    let currentTime = new Date("2026-01-01T00:00:00.000Z");
    const testApi = await startTestApi(() => currentTime);
    const { exchange } = await signInExtension(testApi.baseUrl);
    const credentials = await applicationCredentials(exchange);
    const session = () =>
      fetch(`${testApi.baseUrl}/api/auth/session`, {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      });

    expect((await session()).status).toBe(200);

    currentTime = new Date("2026-01-01T00:16:00.000Z");
    expect((await session()).status).toBe(401);
  });
});

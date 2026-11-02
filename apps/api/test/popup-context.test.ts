import { createHash } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import { createApi } from "../src/app.ts";
import { createPgliteAuthStore } from "../src/auth/store.ts";
import { createPglitePreferenceStore } from "../src/preferences/store.ts";
import { createPgliteMulticamSessionStore } from "../src/sessions/store.ts";

const openApis: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(openApis.splice(0).map((api) => api.close()));
});

async function startTestApi() {
  const database = new PGlite();
  const authStore = await createPgliteAuthStore(database);
  const preferenceStore = await createPglitePreferenceStore(database);
  const sessionStore = await createPgliteMulticamSessionStore(database);
  const api = createApi(
    {
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
      twitch: {
        async exchangeCode({ code }) {
          return { accessToken: code, refreshToken: "twitch-refresh" };
        },
        async validateAccessToken(accessToken) {
          if (accessToken === "second-user") {
            return {
              clientId: "multicam-client",
              login: "second_streamer",
              twitchUserId: "987654321",
            };
          }
          return {
            clientId: "multicam-client",
            login: "camera_captain",
            twitchUserId: "141981764",
          };
        },
      },
    },
    preferenceStore,
    {
      sessionStore,
      streamStatus: {
        async findCurrentStream(twitchUserId: string) {
          return twitchUserId === "987654321"
            ? { streamId: "stream-987" }
            : undefined;
        },
        async findUserByLogin(login: string) {
          if (login === "camera_captain") {
            return { login, twitchUserId: "141981764" };
          }
          if (login === "second_streamer") {
            return { login, twitchUserId: "987654321" };
          }
          return undefined;
        },
      },
    },
  );
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

async function extensionAccessToken(baseUrl: string, twitchCode = "twitch-code") {
  const verifier = "a".repeat(64);
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  const redirectUri = "https://extension.multicam.test/callback";
  const begin = await fetch(
    `${baseUrl}/auth/extension/twitch?redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${challenge}`,
    { redirect: "manual" },
  );
  const state = new URL(begin.headers.get("location") ?? "").searchParams.get(
    "state",
  );
  const callback = await fetch(
    `${baseUrl}/auth/extension/twitch/callback?code=${twitchCode}&state=${state}`,
    { redirect: "manual" },
  );
  const code = new URL(callback.headers.get("location") ?? "").searchParams.get(
    "code",
  );
  const exchange = await fetch(`${baseUrl}/api/extension-auth/exchange`, {
    body: JSON.stringify({ code, codeVerifier: verifier }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const credentials: unknown = await exchange.json();
  if (
    typeof credentials !== "object" ||
    credentials === null ||
    !("accessToken" in credentials) ||
    typeof credentials.accessToken !== "string"
  ) {
    throw new Error("Expected an extension access token");
  }
  return credentials.accessToken;
}

const preferences = {
  mainSlot: "topLeft",
  slots: [
    { active: true, label: "Host", slot: "topLeft" },
    { active: true, label: "Guest", slot: "topRight" },
    { active: false, label: "", slot: "bottomLeft" },
    { active: false, label: "", slot: "bottomRight" },
  ],
};

describe("popup channel context", () => {
  it("returns broadcaster controls only when stable Twitch identities match", async () => {
    const testApi = await startTestApi();
    const accessToken = await extensionAccessToken(testApi.baseUrl);
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "PUT",
    });

    const response = await fetch(
      `${testApi.baseUrl}/api/popup-context?channel=camera_captain`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "owner",
      multicam: { active: false },
      preferences,
    });
  });

  it("returns only viewer information on another active channel", async () => {
    const testApi = await startTestApi();
    const broadcasterToken = await extensionAccessToken(
      testApi.baseUrl,
      "second-user",
    );
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers: {
        Authorization: `Bearer ${broadcasterToken}`,
        "Content-Type": "application/json",
      },
      method: "PUT",
    });
    await fetch(`${testApi.baseUrl}/api/multicam/enable`, {
      headers: { Authorization: `Bearer ${broadcasterToken}` },
      method: "POST",
    });
    const viewerToken = await extensionAccessToken(testApi.baseUrl);

    const response = await fetch(
      `${testApi.baseUrl}/api/popup-context?channel=second_streamer`,
      { headers: { Authorization: `Bearer ${viewerToken}` } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      kind: "viewer",
      session: {
        active: true,
        cameras: [
          { label: "Host", slot: "topLeft" },
          { label: "Guest", slot: "topRight" },
        ],
        mainSlot: "topLeft",
      },
    });
  });

  it("reports unpublished owner edits against the live snapshot", async () => {
    const testApi = await startTestApi();
    const broadcasterToken = await extensionAccessToken(
      testApi.baseUrl,
      "second-user",
    );
    const headers = {
      Authorization: `Bearer ${broadcasterToken}`,
      "Content-Type": "application/json",
    };
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers,
      method: "PUT",
    });
    await fetch(`${testApi.baseUrl}/api/multicam/enable`, {
      headers,
      method: "POST",
    });
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify({
        ...preferences,
        slots: preferences.slots.map((camera) =>
          camera.slot === "topLeft"
            ? { ...camera, label: "Presenter" }
            : camera,
        ),
      }),
      headers,
      method: "PUT",
    });

    const response = await fetch(
      `${testApi.baseUrl}/api/popup-context?channel=second_streamer`,
      { headers },
    );

    expect(await response.json()).toMatchObject({
      kind: "owner",
      multicam: {
        active: true,
        hasUnpublishedChanges: true,
      },
    });
  });
});

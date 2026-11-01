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
        oauthStateTtlMs: 600_000,
        secureCookies: true,
        sessionTtlMs: 86_400_000,
        twitchClientId: "multicam-client",
        twitchClientSecret: "server-only-secret",
      },
      authStore,
      twitch: {
        async exchangeCode() {
          return { accessToken: "access", refreshToken: "refresh" };
        },
        async validateAccessToken() {
          return {
            clientId: "multicam-client",
            login: "Camera_Captain",
            twitchUserId: "141981764",
          };
        },
      },
    },
    preferenceStore,
    {
      now: () => new Date("2026-11-01T12:00:00.000Z"),
      sessionStore,
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

function cookieFrom(response: Response, name: string) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(new RegExp(`(?:^|, )(${name}=[^;]*)`));
  if (!match?.[1]) throw new Error(`Expected response to set ${name}`);
  return match[1];
}

async function signIn(baseUrl: string) {
  const begin = await fetch(`${baseUrl}/auth/twitch`, { redirect: "manual" });
  const state = new URL(begin.headers.get("location") ?? "").searchParams.get(
    "state",
  );
  const callback = await fetch(
    `${baseUrl}/auth/twitch/callback?code=code&state=${state}`,
    {
      headers: { Cookie: cookieFrom(begin, "multicam_oauth") },
      redirect: "manual",
    },
  );
  return cookieFrom(callback, "multicam_session");
}

const preferences = {
  mainSlot: "topRight",
  slots: [
    { active: true, label: "Host", slot: "topLeft" },
    { active: true, label: "Close-up", slot: "topRight" },
    { active: false, label: "", slot: "bottomLeft" },
    { active: true, label: "Wide", slot: "bottomRight" },
  ],
};

describe("published Multicam sessions", () => {
  it("publishes saved preferences for unauthenticated viewers", async () => {
    const testApi = await startTestApi();
    const sessionCookie = await signIn(testApi.baseUrl);
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      method: "PUT",
    });

    const enabled = await fetch(`${testApi.baseUrl}/api/multicam/enable`, {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });
    expect(enabled.status).toBe(200);

    const publicLookup = await fetch(
      `${testApi.baseUrl}/api/public/channels/camera_captain/multicam`,
    );
    expect(publicLookup.status).toBe(200);
    expect(await publicLookup.json()).toEqual({
      active: true,
      cameras: [
        { label: "Host", slot: "topLeft" },
        { label: "Close-up", slot: "topRight" },
        { label: "Wide", slot: "bottomRight" },
      ],
      expiresAt: "2026-11-02T12:00:00.000Z",
      layout: "2x2",
      mainSlot: "topRight",
      protocolVersion: 1,
      revision: 1,
    });
  });
});

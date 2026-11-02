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

async function startTestApi(streamId: string | null = "stream-123") {
  let currentStreamId = streamId;
  let currentTime = new Date("2026-11-01T12:00:00.000Z");
  let streamStatusFails = false;
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
      now: () => currentTime,
      sessionStore,
      streamStatus: {
        async findCurrentStream() {
          if (streamStatusFails) throw new Error("Twitch unavailable");
          return currentStreamId ? { streamId: currentStreamId } : undefined;
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
    setStreamId(nextStreamId: string | null) {
      currentStreamId = nextStreamId;
    },
    setTime(isoTimestamp: string) {
      currentTime = new Date(isoTimestamp);
    },
    setStreamStatusFails(fails: boolean) {
      streamStatusFails = fails;
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
  it("keeps preference edits as an unpublished draft", async () => {
    const testApi = await startTestApi();
    const sessionCookie = await signIn(testApi.baseUrl);
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      method: "PUT",
    });
    await fetch(`${testApi.baseUrl}/api/multicam/enable`, {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });

    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify({
        ...preferences,
        mainSlot: "topLeft",
        slots: preferences.slots.map((camera) =>
          camera.slot === "topLeft" ? { ...camera, label: "Presenter" } : camera,
        ),
      }),
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      method: "PUT",
    });

    const ownerStatus = await fetch(`${testApi.baseUrl}/api/multicam`, {
      headers: { Cookie: sessionCookie },
    });

    expect(ownerStatus.status).toBe(200);
    expect(await ownerStatus.json()).toMatchObject({
      active: true,
      hasUnpublishedChanges: true,
      live: {
        mainSlot: "topRight",
        revision: 1,
      },
    });
    const publicLookup = await fetch(
      `${testApi.baseUrl}/api/public/channels/camera_captain/multicam`,
    );
    expect(await publicLookup.json()).toMatchObject({
      cameras: expect.arrayContaining([
        { label: "Host", slot: "topLeft" },
      ]),
      mainSlot: "topRight",
      revision: 1,
    });
  });

  it("publishes the complete draft as one new revision", async () => {
    const testApi = await startTestApi();
    const sessionCookie = await signIn(testApi.baseUrl);
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      method: "PUT",
    });
    await fetch(`${testApi.baseUrl}/api/multicam/enable`, {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });
    const draft = {
      mainSlot: "topLeft",
      slots: preferences.slots.map((camera) =>
        camera.slot === "topLeft" ? { ...camera, label: "Presenter" } : camera,
      ),
    };
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(draft),
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      method: "PUT",
    });

    const published = await fetch(`${testApi.baseUrl}/api/multicam/publish`, {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });

    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({
      active: true,
      cameras: expect.arrayContaining([
        { label: "Presenter", slot: "topLeft" },
      ]),
      mainSlot: "topLeft",
      revision: 2,
    });
    const ownerStatus = await fetch(`${testApi.baseUrl}/api/multicam`, {
      headers: { Cookie: sessionCookie },
    });
    expect(await ownerStatus.json()).toMatchObject({
      active: true,
      hasUnpublishedChanges: false,
      live: { mainSlot: "topLeft", revision: 2 },
    });
    const publicLookup = await fetch(
      `${testApi.baseUrl}/api/public/channels/camera_captain/multicam`,
    );
    expect(await publicLookup.json()).toMatchObject({
      cameras: expect.arrayContaining([
        { label: "Presenter", slot: "topLeft" },
      ]),
      mainSlot: "topLeft",
      revision: 2,
    });
  });

  it("rejects publication when the saved preferences match live", async () => {
    const testApi = await startTestApi();
    const sessionCookie = await signIn(testApi.baseUrl);
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      method: "PUT",
    });
    await fetch(`${testApi.baseUrl}/api/multicam/enable`, {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });

    const published = await fetch(`${testApi.baseUrl}/api/multicam/publish`, {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });

    expect(published.status).toBe(409);
    expect(await published.json()).toEqual({
      code: "NO_UNPUBLISHED_CHANGES",
      message: "The live configuration already matches saved preferences.",
    });
    const publicLookup = await fetch(
      `${testApi.baseUrl}/api/public/channels/camera_captain/multicam`,
    );
    expect(await publicLookup.json()).toMatchObject({ revision: 1 });
  });

  it("disables the active session without deleting saved preferences", async () => {
    const testApi = await startTestApi();
    const sessionCookie = await signIn(testApi.baseUrl);
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      method: "PUT",
    });
    await fetch(`${testApi.baseUrl}/api/multicam/enable`, {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });

    const disabled = await fetch(`${testApi.baseUrl}/api/multicam`, {
      headers: { Cookie: sessionCookie },
      method: "DELETE",
    });

    expect(disabled.status).toBe(200);
    expect(await disabled.json()).toEqual({ active: false });
    const publicLookup = await fetch(
      `${testApi.baseUrl}/api/public/channels/camera_captain/multicam`,
    );
    expect(await publicLookup.json()).toEqual({ active: false });
    const saved = await fetch(`${testApi.baseUrl}/api/preferences`, {
      headers: { Cookie: sessionCookie },
    });
    expect(await saved.json()).toEqual(preferences);
  });

  it("rejects activation while the authenticated broadcaster is offline", async () => {
    const testApi = await startTestApi(null);
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

    expect(enabled.status).toBe(409);
    expect(await enabled.json()).toEqual({
      code: "TWITCH_STREAM_OFFLINE",
      message: "Start your Twitch stream first.",
    });

    const publicLookup = await fetch(
      `${testApi.baseUrl}/api/public/channels/camera_captain/multicam`,
    );
    expect(await publicLookup.json()).toEqual({ active: false });
  });

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

  it("stops publishing when Twitch reports a different broadcast", async () => {
    const testApi = await startTestApi("stream-123");
    const sessionCookie = await signIn(testApi.baseUrl);
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      method: "PUT",
    });
    await fetch(`${testApi.baseUrl}/api/multicam/enable`, {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });

    testApi.setStreamId("stream-456");
    const publicLookup = await fetch(
      `${testApi.baseUrl}/api/public/channels/camera_captain/multicam`,
    );

    expect(await publicLookup.json()).toEqual({ active: false });
  });

  it("stops publishing when the broadcast goes offline", async () => {
    const testApi = await startTestApi("stream-123");
    const sessionCookie = await signIn(testApi.baseUrl);
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      method: "PUT",
    });
    await fetch(`${testApi.baseUrl}/api/multicam/enable`, {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });

    testApi.setStreamId(null);
    const publicLookup = await fetch(
      `${testApi.baseUrl}/api/public/channels/camera_captain/multicam`,
    );

    expect(await publicLookup.json()).toEqual({ active: false });
  });

  it("stops publishing at the 24-hour fallback expiry", async () => {
    const testApi = await startTestApi("stream-123");
    const sessionCookie = await signIn(testApi.baseUrl);
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      method: "PUT",
    });
    await fetch(`${testApi.baseUrl}/api/multicam/enable`, {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });

    testApi.setTime("2026-11-02T12:00:00.000Z");
    const publicLookup = await fetch(
      `${testApi.baseUrl}/api/public/channels/camera_captain/multicam`,
    );

    expect(await publicLookup.json()).toEqual({ active: false });
  });

  it("allows explicit reactivation of the same broadcast after expiry", async () => {
    const testApi = await startTestApi("stream-123");
    const sessionCookie = await signIn(testApi.baseUrl);
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      method: "PUT",
    });
    await fetch(`${testApi.baseUrl}/api/multicam/enable`, {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });
    testApi.setTime("2026-11-02T12:00:00.000Z");

    const reenabled = await fetch(
      `${testApi.baseUrl}/api/multicam/enable`,
      {
        headers: { Cookie: sessionCookie },
        method: "POST",
      },
    );

    expect(reenabled.status).toBe(200);
    expect(await reenabled.json()).toMatchObject({
      active: true,
      expiresAt: "2026-11-03T12:00:00.000Z",
    });
    const publicLookup = await fetch(
      `${testApi.baseUrl}/api/public/channels/camera_captain/multicam`,
    );
    expect(await publicLookup.json()).toMatchObject({
      active: true,
      expiresAt: "2026-11-03T12:00:00.000Z",
    });
  });

  it("reports a Twitch status outage without publishing a session", async () => {
    const testApi = await startTestApi("stream-123");
    const sessionCookie = await signIn(testApi.baseUrl);
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      method: "PUT",
    });
    testApi.setStreamStatusFails(true);

    const enabled = await fetch(`${testApi.baseUrl}/api/multicam/enable`, {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });

    expect(enabled.status).toBe(502);
    expect(await enabled.json()).toEqual({
      code: "TWITCH_STATUS_UNAVAILABLE",
      message: "Twitch stream status is temporarily unavailable.",
    });
  });
});

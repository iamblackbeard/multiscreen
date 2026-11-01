import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import { createApi } from "../src/app.ts";
import { createPgliteAuthStore } from "../src/auth/store.ts";
import { createPglitePreferenceStore } from "../src/preferences/store.ts";

const openApis: Array<{
  close(): Promise<void>;
}> = [];

afterEach(async () => {
  await Promise.all(openApis.splice(0).map((api) => api.close()));
});

async function startTestApi() {
  const database = new PGlite();
  const authStore = await createPgliteAuthStore(database);
  const preferenceStore = await createPglitePreferenceStore(database);
  const api = createApi(
    {
      authConfig: {
        callbackUrl: "https://api.multicam.test/auth/twitch/callback",
        dashboardUrl: "https://dashboard.multicam.test/",
        oauthStateTtlMs: 10 * 60 * 1_000,
        secureCookies: true,
        sessionTtlMs: 24 * 60 * 60 * 1_000,
        twitchClientId: "multicam-client",
        twitchClientSecret: "server-only-secret",
      },
      authStore,
      twitch: {
        async exchangeCode({ code }) {
          return {
            accessToken: code,
            refreshToken: "server-only-refresh-token",
          };
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

async function signIn(baseUrl: string, code = "twitch-code") {
  const begin = await fetch(`${baseUrl}/auth/twitch`, { redirect: "manual" });
  const state = new URL(begin.headers.get("location") ?? "").searchParams.get(
    "state",
  );
  const callback = await fetch(
    `${baseUrl}/auth/twitch/callback?code=${code}&state=${state}`,
    {
      headers: { Cookie: cookieFrom(begin, "multicam_oauth") },
      redirect: "manual",
    },
  );
  return cookieFrom(callback, "multicam_session");
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

describe("streamer camera preferences", () => {
  it("saves and reloads valid preferences for the authenticated streamer", async () => {
    const testApi = await startTestApi();
    const sessionCookie = await signIn(testApi.baseUrl);

    const saved = await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      method: "PUT",
    });

    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual(preferences);

    const reloaded = await fetch(`${testApi.baseUrl}/api/preferences`, {
      headers: { Cookie: sessionCookie },
    });

    expect(reloaded.status).toBe(200);
    expect(await reloaded.json()).toEqual(preferences);
  });

  it("returns a field issue when fewer than two cameras are active", async () => {
    const testApi = await startTestApi();
    const sessionCookie = await signIn(testApi.baseUrl);
    const invalidPreferences = {
      ...preferences,
      slots: preferences.slots.map((camera, index) => ({
        ...camera,
        active: index === 0,
      })),
    };

    const response = await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(invalidPreferences),
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      method: "PUT",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "INVALID_PREFERENCES",
      issues: [
        {
          code: "INVALID_CAMERA_COUNT",
          message: "Activate between two and four cameras.",
          path: ["slots"],
        },
      ],
      message: "Camera preferences are invalid.",
    });
  });

  it("returns a field issue when the main camera is inactive", async () => {
    const testApi = await startTestApi();
    const sessionCookie = await signIn(testApi.baseUrl);

    const response = await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify({ ...preferences, mainSlot: "bottomLeft" }),
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      method: "PUT",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "INVALID_PREFERENCES",
      issues: [
        {
          code: "INACTIVE_MAIN_CAMERA",
          message: "Select an active camera as the main camera.",
          path: ["mainSlot"],
        },
      ],
      message: "Camera preferences are invalid.",
    });
  });

  it("returns a field issue when an active camera has an empty label", async () => {
    const testApi = await startTestApi();
    const sessionCookie = await signIn(testApi.baseUrl);
    const invalidPreferences = {
      ...preferences,
      slots: preferences.slots.map((camera, index) =>
        index === 1 ? { ...camera, label: "   " } : camera,
      ),
    };

    const response = await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(invalidPreferences),
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      method: "PUT",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "INVALID_PREFERENCES",
      issues: [
        {
          code: "EMPTY_CAMERA_LABEL",
          message: "Enter a label for each active camera.",
          path: ["slots", 1, "label"],
        },
      ],
      message: "Camera preferences are invalid.",
    });
  });

  it("returns a field issue when a camera label exceeds 40 characters", async () => {
    const testApi = await startTestApi();
    const sessionCookie = await signIn(testApi.baseUrl);
    const invalidPreferences = {
      ...preferences,
      slots: preferences.slots.map((camera, index) =>
        index === 0 ? { ...camera, label: "x".repeat(41) } : camera,
      ),
    };

    const response = await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(invalidPreferences),
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      method: "PUT",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "INVALID_PREFERENCES",
      issues: [
        {
          code: "CAMERA_LABEL_TOO_LONG",
          message: "Camera labels must be 40 characters or fewer.",
          path: ["slots", 0, "label"],
        },
      ],
      message: "Camera preferences are invalid.",
    });
  });

  it("keeps each broadcaster's preferences private", async () => {
    const testApi = await startTestApi();
    const firstSession = await signIn(testApi.baseUrl);
    const secondSession = await signIn(testApi.baseUrl, "second-user");

    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(preferences),
      headers: { "Content-Type": "application/json", Cookie: firstSession },
      method: "PUT",
    });

    const secondRead = await fetch(`${testApi.baseUrl}/api/preferences`, {
      headers: { Cookie: secondSession },
    });
    expect(secondRead.status).toBe(404);

    const secondPreferences = {
      ...preferences,
      mainSlot: "topRight",
      slots: preferences.slots.map((camera) => ({
        ...camera,
        label: camera.active ? `Second ${camera.label}` : camera.label,
      })),
    };
    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(secondPreferences),
      headers: { "Content-Type": "application/json", Cookie: secondSession },
      method: "PUT",
    });

    const firstRead = await fetch(`${testApi.baseUrl}/api/preferences`, {
      headers: { Cookie: firstSession },
    });
    expect(await firstRead.json()).toEqual(preferences);

    const secondReload = await fetch(`${testApi.baseUrl}/api/preferences`, {
      headers: { Cookie: secondSession },
    });
    expect(await secondReload.json()).toEqual(secondPreferences);
  });

  it("rejects preferences that do not contain each fixed quadrant once", async () => {
    const testApi = await startTestApi();
    const sessionCookie = await signIn(testApi.baseUrl);
    const invalidPreferences = {
      ...preferences,
      slots: preferences.slots.map((camera, index) =>
        index === 3 ? { ...camera, slot: "bottomLeft" } : camera,
      ),
    };

    const response = await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(invalidPreferences),
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      method: "PUT",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "INVALID_PREFERENCES",
      issues: [
        {
          code: "INVALID_SLOT_SET",
          message: "Include each of the four fixed camera slots once.",
          path: ["slots"],
        },
      ],
      message: "Camera preferences are invalid.",
    });
  });

  it("stores markup-like camera labels as plain text", async () => {
    const testApi = await startTestApi();
    const sessionCookie = await signIn(testApi.baseUrl);
    const plainTextLabel = "<img src=x onerror=alert(1)>";
    const markupLikePreferences = {
      ...preferences,
      slots: preferences.slots.map((camera, index) =>
        index === 0 ? { ...camera, label: plainTextLabel } : camera,
      ),
    };

    await fetch(`${testApi.baseUrl}/api/preferences`, {
      body: JSON.stringify(markupLikePreferences),
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      method: "PUT",
    });
    const reloaded = await fetch(`${testApi.baseUrl}/api/preferences`, {
      headers: { Cookie: sessionCookie },
    });

    expect(await reloaded.json()).toEqual(markupLikePreferences);
  });
});

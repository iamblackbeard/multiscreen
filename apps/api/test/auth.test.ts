import type { AddressInfo } from "node:net";
import { once } from "node:events";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import { createApi } from "../src/app.ts";
import { createPgliteAuthStore } from "../src/auth/store.ts";

const authConfig = {
  callbackUrl: "https://api.multicam.test/auth/twitch/callback",
  dashboardUrl: "https://dashboard.multicam.test/",
  oauthStateTtlMs: 10 * 60 * 1_000,
  secureCookies: true,
  sessionTtlMs: 24 * 60 * 60 * 1_000,
  twitchClientId: "multicam-client",
  twitchClientSecret: "server-only-secret",
};

const successfulTwitch = {
  async exchangeCode() {
    return {
      accessToken: "server-only-access-token",
      refreshToken: "server-only-refresh-token",
    };
  },
  async validateAccessToken() {
    return {
      clientId: "multicam-client",
      login: "camera_captain",
      twitchUserId: "141981764",
    };
  },
};

async function startTestApi(
  configOverrides: Partial<typeof authConfig> = {},
  twitch = successfulTwitch,
) {
  const database = new PGlite();
  const authStore = await createPgliteAuthStore(database);
  const api = createApi({
    authConfig: { ...authConfig, ...configOverrides },
    authStore,
    twitch,
  });
  const server = api.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      server.close();
      await database.close();
    },
  };
}

function cookieFrom(response: Response, name: string) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Expected response to set a cookie");
  const match = setCookie.match(new RegExp(`(?:^|, )(${name}=[^;]*)`));
  if (!match?.[1]) throw new Error(`Expected response to set ${name}`);
  return match[1];
}

async function errorCode(response: Response) {
  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("code" in payload) ||
    typeof payload.code !== "string"
  ) {
    throw new Error("Expected an API error response");
  }
  return payload.code;
}

describe("Twitch dashboard authentication", () => {
  it("signs a streamer in with Twitch and exposes only their application identity", async () => {
    const testApi = await startTestApi();

    try {
      const signIn = await fetch(`${testApi.baseUrl}/auth/twitch`, {
        redirect: "manual",
      });
      const twitchAuthorization = new URL(
        signIn.headers.get("location") ?? "",
      );
      const state = twitchAuthorization.searchParams.get("state");

      expect(signIn.status).toBe(302);
      expect(twitchAuthorization.origin).toBe("https://id.twitch.tv");
      expect(twitchAuthorization.pathname).toBe("/oauth2/authorize");
      expect(twitchAuthorization.searchParams.get("response_type")).toBe(
        "code",
      );
      expect(twitchAuthorization.searchParams.get("scope")).toBe("openid");
      expect(state).toBeTruthy();

      const callback = await fetch(
        `${testApi.baseUrl}/auth/twitch/callback?code=twitch-code&state=${state}`,
        {
          headers: { Cookie: cookieFrom(signIn, "multicam_oauth") },
          redirect: "manual",
        },
      );

      expect(callback.status).toBe(302);
      expect(callback.headers.get("location")).toBe(
        "https://dashboard.multicam.test/",
      );
      expect(callback.headers.get("set-cookie")).toContain("HttpOnly");
      expect(callback.headers.get("set-cookie")).toContain("Secure");
      expect(callback.headers.get("set-cookie")).toContain("SameSite=Lax");

      const session = await fetch(`${testApi.baseUrl}/api/auth/session`, {
        headers: { Cookie: cookieFrom(callback, "multicam_session") },
      });

      expect(session.status).toBe(200);
      expect(await session.json()).toEqual({
        authenticated: true,
        streamer: {
          login: "camera_captain",
          twitchUserId: "141981764",
        },
      });
    } finally {
      await testApi.close();
    }
  });

  it("rejects a callback when OAuth state is absent", async () => {
    const testApi = await startTestApi();

    try {
      const callback = await fetch(
        `${testApi.baseUrl}/auth/twitch/callback?code=twitch-code`,
        { redirect: "manual" },
      );

      expect(callback.status).toBe(400);
      expect(await callback.json()).toEqual({
        code: "INVALID_OAUTH_STATE",
        message: "The Twitch sign-in attempt is invalid or expired.",
      });
    } finally {
      await testApi.close();
    }
  });

  it("rejects a callback when OAuth state does not match the initiating browser", async () => {
    const testApi = await startTestApi();

    try {
      const signIn = await fetch(`${testApi.baseUrl}/auth/twitch`, {
        redirect: "manual",
      });
      const callback = await fetch(
        `${testApi.baseUrl}/auth/twitch/callback?code=twitch-code&state=attacker-state`,
        {
          headers: { Cookie: cookieFrom(signIn, "multicam_oauth") },
          redirect: "manual",
        },
      );

      expect(callback.status).toBe(400);
      expect(await errorCode(callback)).toBe("INVALID_OAUTH_STATE");
    } finally {
      await testApi.close();
    }
  });

  it("rejects an expired OAuth state", async () => {
    const testApi = await startTestApi({ oauthStateTtlMs: -1 });

    try {
      const signIn = await fetch(`${testApi.baseUrl}/auth/twitch`, {
        redirect: "manual",
      });
      const authorization = new URL(signIn.headers.get("location") ?? "");
      const callback = await fetch(
        `${testApi.baseUrl}/auth/twitch/callback?code=twitch-code&state=${authorization.searchParams.get("state")}`,
        {
          headers: { Cookie: cookieFrom(signIn, "multicam_oauth") },
          redirect: "manual",
        },
      );

      expect(callback.status).toBe(400);
      expect(await errorCode(callback)).toBe("INVALID_OAUTH_STATE");
    } finally {
      await testApi.close();
    }
  });

  it("rejects reuse of a consumed OAuth state", async () => {
    const testApi = await startTestApi();

    try {
      const signIn = await fetch(`${testApi.baseUrl}/auth/twitch`, {
        redirect: "manual",
      });
      const oauthCookie = cookieFrom(signIn, "multicam_oauth");
      const authorization = new URL(signIn.headers.get("location") ?? "");
      const callbackUrl = `${testApi.baseUrl}/auth/twitch/callback?code=twitch-code&state=${authorization.searchParams.get("state")}`;

      const firstCallback = await fetch(callbackUrl, {
        headers: { Cookie: oauthCookie },
        redirect: "manual",
      });
      const reusedCallback = await fetch(callbackUrl, {
        headers: { Cookie: oauthCookie },
        redirect: "manual",
      });

      expect(firstCallback.status).toBe(302);
      expect(reusedCallback.status).toBe(400);
      expect(await errorCode(reusedCallback)).toBe("INVALID_OAUTH_STATE");
    } finally {
      await testApi.close();
    }
  });

  it("does not create a session when Twitch rejects the code exchange", async () => {
    const testApi = await startTestApi({}, {
      ...successfulTwitch,
      async exchangeCode() {
        throw new Error("Twitch token endpoint rejected the code");
      },
    });

    try {
      const signIn = await fetch(`${testApi.baseUrl}/auth/twitch`, {
        redirect: "manual",
      });
      const authorization = new URL(signIn.headers.get("location") ?? "");
      const callback = await fetch(
        `${testApi.baseUrl}/auth/twitch/callback?code=invalid-code&state=${authorization.searchParams.get("state")}`,
        {
          headers: { Cookie: cookieFrom(signIn, "multicam_oauth") },
          redirect: "manual",
        },
      );

      expect(callback.status).toBe(502);
      expect(await callback.json()).toEqual({
        code: "TWITCH_EXCHANGE_FAILED",
        message: "Twitch could not complete sign-in. Please try again.",
      });
      expect(callback.headers.get("set-cookie") ?? "").not.toContain(
        "multicam_session=",
      );
    } finally {
      await testApi.close();
    }
  });

  it("does not create a session when Twitch cannot validate the access token", async () => {
    const testApi = await startTestApi({}, {
      ...successfulTwitch,
      async validateAccessToken() {
        throw new Error("Twitch rejected the access token");
      },
    });

    try {
      const signIn = await fetch(`${testApi.baseUrl}/auth/twitch`, {
        redirect: "manual",
      });
      const authorization = new URL(signIn.headers.get("location") ?? "");
      const callback = await fetch(
        `${testApi.baseUrl}/auth/twitch/callback?code=twitch-code&state=${authorization.searchParams.get("state")}`,
        {
          headers: { Cookie: cookieFrom(signIn, "multicam_oauth") },
          redirect: "manual",
        },
      );

      expect(callback.status).toBe(502);
      expect(await callback.json()).toEqual({
        code: "TWITCH_VALIDATION_FAILED",
        message: "Twitch could not validate sign-in. Please try again.",
      });
      expect(callback.headers.get("set-cookie") ?? "").not.toContain(
        "multicam_session=",
      );
    } finally {
      await testApi.close();
    }
  });

  it("rejects credentials issued for another Twitch application", async () => {
    const testApi = await startTestApi({}, {
      ...successfulTwitch,
      async validateAccessToken() {
        return {
          clientId: "another-client",
          login: "camera_captain",
          twitchUserId: "141981764",
        };
      },
    });

    try {
      const signIn = await fetch(`${testApi.baseUrl}/auth/twitch`, {
        redirect: "manual",
      });
      const authorization = new URL(signIn.headers.get("location") ?? "");
      const callback = await fetch(
        `${testApi.baseUrl}/auth/twitch/callback?code=twitch-code&state=${authorization.searchParams.get("state")}`,
        {
          headers: { Cookie: cookieFrom(signIn, "multicam_oauth") },
          redirect: "manual",
        },
      );

      expect(callback.status).toBe(401);
      expect(await errorCode(callback)).toBe("INVALID_TWITCH_CREDENTIALS");
      expect(callback.headers.get("set-cookie") ?? "").not.toContain(
        "multicam_session=",
      );
    } finally {
      await testApi.close();
    }
  });

  it("rejects a Twitch identity without a stable numeric user ID", async () => {
    const testApi = await startTestApi({}, {
      ...successfulTwitch,
      async validateAccessToken() {
        return {
          clientId: "multicam-client",
          login: "camera_captain",
          twitchUserId: "not-a-twitch-id",
        };
      },
    });

    try {
      const signIn = await fetch(`${testApi.baseUrl}/auth/twitch`, {
        redirect: "manual",
      });
      const authorization = new URL(signIn.headers.get("location") ?? "");
      const callback = await fetch(
        `${testApi.baseUrl}/auth/twitch/callback?code=twitch-code&state=${authorization.searchParams.get("state")}`,
        {
          headers: { Cookie: cookieFrom(signIn, "multicam_oauth") },
          redirect: "manual",
        },
      );

      expect(callback.status).toBe(401);
      expect(await errorCode(callback)).toBe("INVALID_TWITCH_CREDENTIALS");
    } finally {
      await testApi.close();
    }
  });
});

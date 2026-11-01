import { afterEach, describe, expect, it, vi } from "vitest";

import { createTwitchAuthClient } from "../src/auth/twitch.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Twitch authentication client", () => {
  it("exchanges an authorization code without exposing the client secret to the browser", async () => {
    const twitchFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "twitch-access-token",
          refresh_token: "twitch-refresh-token",
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    );
    vi.stubGlobal("fetch", twitchFetch);
    const twitch = createTwitchAuthClient();

    const credentials = await twitch.exchangeCode({
      clientId: "multicam-client",
      clientSecret: "server-only-secret",
      code: "authorization-code",
      redirectUri: "https://api.multicam.test/auth/twitch/callback",
    });

    expect(credentials).toEqual({
      accessToken: "twitch-access-token",
      refreshToken: "twitch-refresh-token",
    });
    const [url, request] = twitchFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://id.twitch.tv/oauth2/token");
    expect(request.method).toBe("POST");
    expect(request.body?.toString()).toBe(
      "client_id=multicam-client&client_secret=server-only-secret&code=authorization-code&grant_type=authorization_code&redirect_uri=https%3A%2F%2Fapi.multicam.test%2Fauth%2Ftwitch%2Fcallback",
    );
  });

  it("validates the exchanged token and returns Twitch's stable identity", async () => {
    const twitchFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          client_id: "multicam-client",
          login: "camera_captain",
          user_id: "141981764",
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    );
    vi.stubGlobal("fetch", twitchFetch);
    const twitch = createTwitchAuthClient();

    const identity = await twitch.validateAccessToken("twitch-access-token");

    expect(identity).toEqual({
      clientId: "multicam-client",
      login: "camera_captain",
      twitchUserId: "141981764",
    });
    expect(twitchFetch).toHaveBeenCalledWith(
      "https://id.twitch.tv/oauth2/validate",
      { headers: { Authorization: "Bearer twitch-access-token" } },
    );
  });
});

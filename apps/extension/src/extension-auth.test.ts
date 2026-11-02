import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { signInWithTwitch } from "./extension-auth.ts";

describe("extension Twitch authentication", () => {
  it("uses browser identity and exchanges the returned single-use code", async () => {
    const launchWebAuthFlow = vi.fn(
      async (_input: { interactive: boolean; url: string }) =>
        "https://extension.multicam.test/callback?code=single-use-code",
    );
    const fetchFromApi: typeof fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          accessToken: "application-access",
          expiresIn: 900,
          refreshToken: "application-refresh",
        }),
        { status: 200 },
      );
      },
    );

    const credentials = await signInWithTwitch({
      apiBaseUrl: "https://api.multicam.test",
      fetchFromApi,
      identity: {
        getRedirectURL: () => "https://extension.multicam.test/callback",
        launchWebAuthFlow,
      },
    });

    expect(credentials).toEqual({
      accessToken: "application-access",
      expiresIn: 900,
      refreshToken: "application-refresh",
    });
    const authorizationUrl = new URL(
      launchWebAuthFlow.mock.calls[0]![0].url,
    );
    expect(authorizationUrl.pathname).toBe("/auth/extension/twitch");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "https://extension.multicam.test/callback",
    );
    const exchangeRequest = vi.mocked(fetchFromApi).mock.calls[0];
    const exchangeBody = JSON.parse(String(exchangeRequest?.[1]?.body));
    expect(exchangeBody.code).toBe("single-use-code");
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe(
      createHash("sha256")
        .update(exchangeBody.codeVerifier)
        .digest("base64url"),
    );
  });
});

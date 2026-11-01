import type { TwitchAuthClient } from "./auth.ts";

export function createTwitchAuthClient(): TwitchAuthClient {
  return {
    async exchangeCode({ clientId, clientSecret, code, redirectUri }) {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const response = await fetch("https://id.twitch.tv/oauth2/token", {
        body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      });
      if (!response.ok) throw new Error("Twitch code exchange failed");

      const payload: unknown = await response.json();
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("access_token" in payload) ||
        typeof payload.access_token !== "string" ||
        !("refresh_token" in payload) ||
        typeof payload.refresh_token !== "string"
      ) {
        throw new Error("Twitch returned invalid credentials");
      }

      return {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
      };
    },

    async validateAccessToken(accessToken) {
      const response = await fetch("https://id.twitch.tv/oauth2/validate", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("Twitch token validation failed");

      const payload: unknown = await response.json();
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("client_id" in payload) ||
        typeof payload.client_id !== "string" ||
        !("login" in payload) ||
        typeof payload.login !== "string" ||
        !("user_id" in payload) ||
        typeof payload.user_id !== "string"
      ) {
        throw new Error("Twitch returned an invalid identity");
      }

      return {
        clientId: payload.client_id,
        login: payload.login,
        twitchUserId: payload.user_id,
      };
    },
  };
}

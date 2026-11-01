export interface TwitchStreamStatusClient {
  findCurrentStream(
    twitchUserId: string,
  ): Promise<{ streamId: string } | undefined>;
}

export function createTwitchStreamStatusClient({
  clientId,
  clientSecret,
  fetchFromTwitch = fetch,
  now = () => new Date(),
}: {
  clientId: string;
  clientSecret: string;
  fetchFromTwitch?: typeof fetch;
  now?: () => Date;
}): TwitchStreamStatusClient {
  let appToken:
    | { accessToken: string; refreshAfter: number }
    | undefined;

  const getAppAccessToken = async () => {
    if (appToken && appToken.refreshAfter > now().getTime()) {
      return appToken.accessToken;
    }

    const tokenResponse = await fetchFromTwitch(
      "https://id.twitch.tv/oauth2/token",
      {
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
        }),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      },
    );
    if (!tokenResponse.ok) {
      throw new Error("Twitch app token request failed");
    }
    const tokenPayload: unknown = await tokenResponse.json();
    if (
      typeof tokenPayload !== "object" ||
      tokenPayload === null ||
      !("access_token" in tokenPayload) ||
      typeof tokenPayload.access_token !== "string" ||
      !("expires_in" in tokenPayload) ||
      typeof tokenPayload.expires_in !== "number" ||
      !Number.isFinite(tokenPayload.expires_in) ||
      tokenPayload.expires_in <= 0
    ) {
      throw new Error("Twitch returned an invalid app token");
    }
    appToken = {
      accessToken: tokenPayload.access_token,
      refreshAfter:
        now().getTime() + Math.max(0, tokenPayload.expires_in - 60) * 1_000,
    };
    return appToken.accessToken;
  };

  return {
    async findCurrentStream(twitchUserId) {
      const accessToken = await getAppAccessToken();

      const streamResponse = await fetchFromTwitch(
        `https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(twitchUserId)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Client-Id": clientId,
          },
        },
      );
      if (!streamResponse.ok) {
        throw new Error("Twitch stream lookup failed");
      }
      const streamPayload: unknown = await streamResponse.json();
      if (
        typeof streamPayload !== "object" ||
        streamPayload === null ||
        !("data" in streamPayload) ||
        !Array.isArray(streamPayload.data)
      ) {
        throw new Error("Twitch returned invalid stream status");
      }
      const stream: unknown = streamPayload.data[0];
      if (stream === undefined) return undefined;
      if (
        typeof stream !== "object" ||
        stream === null ||
        !("id" in stream) ||
        typeof stream.id !== "string"
      ) {
        throw new Error("Twitch returned invalid stream status");
      }
      return { streamId: stream.id };
    },
  };
}

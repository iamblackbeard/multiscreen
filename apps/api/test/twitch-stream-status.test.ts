import { describe, expect, it, vi } from "vitest";

import { createTwitchStreamStatusClient } from "../src/sessions/twitch.ts";

describe("Twitch stream status client", () => {
  it("resolves the current broadcast from the stable Twitch user ID", async () => {
    const fetchFromTwitch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "app-access-token",
            expires_in: 3600,
            token_type: "bearer",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "stream-123", user_id: "141981764" }],
          }),
          { status: 200 },
        ),
      );
    const twitch = createTwitchStreamStatusClient({
      clientId: "multicam-client",
      clientSecret: "server-only-secret",
      fetchFromTwitch,
    });

    const stream = await twitch.findCurrentStream("141981764");

    expect(stream).toEqual({ streamId: "stream-123" });
    expect(fetchFromTwitch).toHaveBeenNthCalledWith(
      2,
      "https://api.twitch.tv/helix/streams?user_id=141981764",
      {
        headers: {
          Authorization: "Bearer app-access-token",
          "Client-Id": "multicam-client",
        },
      },
    );
  });

  it("returns offline when Twitch has no current stream", async () => {
    const fetchFromTwitch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "app-access-token",
            expires_in: 3600,
            token_type: "bearer",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );
    const twitch = createTwitchStreamStatusClient({
      clientId: "multicam-client",
      clientSecret: "server-only-secret",
      fetchFromTwitch,
    });

    expect(await twitch.findCurrentStream("141981764")).toBeUndefined();
  });

  it("reuses a valid app access token across stream lookups", async () => {
    const fetchFromTwitch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "app-access-token",
            expires_in: 3600,
            token_type: "bearer",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "stream-456", user_id: "24680" }],
          }),
          { status: 200 },
        ),
      );
    const twitch = createTwitchStreamStatusClient({
      clientId: "multicam-client",
      clientSecret: "server-only-secret",
      fetchFromTwitch,
      now: () => new Date("2026-11-01T12:00:00.000Z"),
    });

    expect(await twitch.findCurrentStream("141981764")).toBeUndefined();
    expect(await twitch.findCurrentStream("24680")).toEqual({
      streamId: "stream-456",
    });
    expect(fetchFromTwitch).toHaveBeenCalledTimes(3);
  });
});

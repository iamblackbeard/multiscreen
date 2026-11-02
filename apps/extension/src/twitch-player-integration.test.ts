// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { testApiBaseUrl } from "./test-environment.ts";
import { startTwitchPlayerIntegration } from "./twitch-player-integration.ts";

const activeSession = {
  active: true as const,
  cameras: [
    { label: "Host", slot: "topLeft" as const },
    { label: "Wide", slot: "topRight" as const },
  ],
  expiresAt: "2099-01-01T00:00:00.000Z",
  layout: "2x2" as const,
  mainSlot: "topLeft" as const,
  protocolVersion: 1 as const,
  revision: 1,
};

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
  document.body.replaceChildren();
});

describe("Twitch player integration", () => {
  it("clears the old player before navigation and ignores its stale response", async () => {
    window.history.replaceState({}, "", "/first_channel");
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video style="transform: rotate(1deg); transform-origin: center"></video>
        <button data-a-target="player-settings-button">Settings</button>
      </div>
    `;
    let resolveStale!: (response: Response) => void;
    const staleResponse = new Promise<Response>((resolve) => {
      resolveStale = resolve;
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(activeSession), {
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockReturnValueOnce(staleResponse)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ active: false }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    const video = document.querySelector<HTMLVideoElement>("video")!;
    const stop = startTwitchPlayerIntegration({
      apiBase: testApiBaseUrl,
      fetch,
      page: document,
    });

    await vi.waitFor(() => expect(video.style.transform).toBe("scale(2)"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    window.history.pushState({}, "", "/second_channel");
    document.body.append(document.createElement("div"));

    await vi.waitFor(() => {
      expect(video.style.transform).toBe("rotate(1deg)");
      expect(video.style.transformOrigin).toBe("center");
      expect(
        document.querySelector("[data-multicam-full-video-control]"),
      ).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    resolveStale(
      new Response(JSON.stringify({ ...activeSession, revision: 2 }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(video.style.transform).toBe("rotate(1deg)");
    expect(
      document.querySelector("[data-multicam-full-video-control]"),
    ).toBeNull();
    stop();

    const requestCountAfterStop = fetch.mock.calls.length;
    document.dispatchEvent(new Event("visibilitychange"));
    document.body.append(document.createElement("div"));
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(requestCountAfterStop);
  });
});

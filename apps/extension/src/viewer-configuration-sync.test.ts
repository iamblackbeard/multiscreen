// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { testApiBaseUrl } from "./test-environment.ts";
import { startViewerConfigurationSync } from "./viewer-configuration-sync.ts";

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
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("viewer configuration synchronization", () => {
  it("fetches and applies configuration immediately on a supported channel", async () => {
    window.history.replaceState({}, "", "/Camera_Captain");
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify(activeSession), {
        headers: { "Content-Type": "application/json", ETag: '"revision-1"' },
      }),
    );
    const applySession = vi.fn();

    const stop = startViewerConfigurationSync({
      apiBase: testApiBaseUrl,
      applySession,
      fetch,
      page: document,
    });

    await vi.waitFor(() => expect(applySession).toHaveBeenCalledWith(
      "camera_captain",
      activeSession,
    ));
    expect(fetch).toHaveBeenCalledWith(
      `${testApiBaseUrl}/api/public/channels/camera_captain/multicam`,
      expect.objectContaining({ headers: {} }),
    );

    stop();
  });

  it("polls every five seconds only while visible and refreshes on visibility return", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/camera_captain");
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ active: false }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    const stop = startViewerConfigurationSync({
      apiBase: testApiBaseUrl,
      applySession: vi.fn(),
      fetch,
      page: document,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetch).toHaveBeenCalledTimes(2);

    hidden = true;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(2);

    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(3);

    stop();
  });

  it("fetches once on channel entry even when the tab is initially hidden", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/camera_captain");
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ active: false }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    const stop = startViewerConfigurationSync({
      apiBase: testApiBaseUrl,
      applySession: vi.fn(),
      fetch,
      page: document,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    stop();
  });

  it("uses the response ETag for unchanged checks and preserves state on 304", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/camera_captain");
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(activeSession), {
          headers: {
            "Content-Type": "application/json",
            ETag: '"revision-1"',
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const applySession = vi.fn();

    const stop = startViewerConfigurationSync({
      apiBase: testApiBaseUrl,
      applySession,
      fetch,
      page: document,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(applySession).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${testApiBaseUrl}/api/public/channels/camera_captain/multicam`,
      { headers: { "If-None-Match": '"revision-1"' } },
    );
    expect(applySession).toHaveBeenCalledTimes(1);

    stop();
  });

  it("prevents a late response from a previous channel altering the new channel", async () => {
    window.history.replaceState({}, "", "/first_channel");
    let resolveFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const secondSession = { ...activeSession, revision: 2 };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(secondSession), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    const applySession = vi.fn();

    const stop = startViewerConfigurationSync({
      apiBase: testApiBaseUrl,
      applySession,
      fetch,
      page: document,
    });
    window.history.pushState({}, "", "/second_channel");
    document.body.append(document.createElement("div"));

    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `${testApiBaseUrl}/api/public/channels/second_channel/multicam`,
        expect.anything(),
      ),
    );
    await vi.waitFor(() =>
      expect(applySession).toHaveBeenCalledWith(
        "second_channel",
        secondSession,
      ),
    );

    resolveFirst(
      new Response(JSON.stringify(activeSession), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(applySession).not.toHaveBeenCalledWith(
      "first_channel",
      activeSession,
    );
    stop();
  });

  it("applies a changed published revision", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/camera_captain");
    const nextSession = {
      ...activeSession,
      cameras: [
        { label: "Presenter", slot: "topLeft" as const },
        { label: "Wide", slot: "topRight" as const },
      ],
      revision: 2,
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(activeSession), {
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(nextSession), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    const applySession = vi.fn();

    const stop = startViewerConfigurationSync({
      apiBase: testApiBaseUrl,
      applySession,
      fetch,
      page: document,
    });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(applySession).toHaveBeenLastCalledWith(
      "camera_captain",
      nextSession,
    );
    stop();
  });

  it("removes Multicam state when a refresh payload is malformed", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/camera_captain");
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(activeSession), {
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ active: true, revision: "broken" }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    const applySession = vi.fn();

    const stop = startViewerConfigurationSync({
      apiBase: testApiBaseUrl,
      applySession,
      fetch,
      page: document,
    });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(applySession).toHaveBeenLastCalledWith("camera_captain", {
      active: false,
    });
    stop();
  });
});

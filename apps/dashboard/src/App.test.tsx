// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Multicam dashboard", () => {
  it("explains the fixed OBS composition protocol and realistic output quality", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              code: "NOT_AUTHENTICATED",
              message: "Sign in with Twitch to continue.",
            }),
            { status: 401 },
          );
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Build one 2×2 OBS scene" }),
    ).toBeTruthy();
    expect(screen.getByText(/two to four unique camera feeds/i)).toBeTruthy();
    expect(screen.getByText(/never duplicate a feed/i)).toBeTruthy();
    expect(screen.getByText(/top-left is a helpful default/i)).toBeTruthy();
    expect(screen.getByText(/unused quadrants/i)).toBeTruthy();
    expect(screen.getByText(/1080p composite.*540p/i)).toBeTruthy();
    expect(screen.getByText(/1440p composite.*720p/i)).toBeTruthy();
    expect(screen.getByText(/cannot restore pixels/i)).toBeTruthy();
    expect(screen.getByText(/does not promise 4K/i)).toBeTruthy();
  });

  it("previews saved active slots, labels, unused quadrants, and the main camera", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              streamer: {
                login: "camera_captain",
                twitchUserId: "141981764",
              },
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/preferences") {
          return new Response(
            JSON.stringify({
              mainSlot: "bottomLeft",
              slots: [
                { active: true, label: "Wide", slot: "topLeft" },
                { active: true, label: "Desk", slot: "topRight" },
                { active: true, label: "Host", slot: "bottomLeft" },
                { active: false, label: "", slot: "bottomRight" },
              ],
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/multicam") {
          return new Response(JSON.stringify({ active: false }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    render(<App />);

    const preview = await screen.findByRole("region", {
      name: "Saved configuration preview",
    });
    expect(within(preview).getByText("Wide")).toBeTruthy();
    expect(within(preview).getByText("Desk")).toBeTruthy();
    expect(within(preview).getByText("Host")).toBeTruthy();
    expect(within(preview).getByText("Unused quadrant")).toBeTruthy();
    expect(within(preview).getByText("Host · Main camera")).toBeTruthy();
  });

  it("lets an inactive streamer enable Multicam for the current broadcast", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              streamer: {
                login: "camera_captain",
                twitchUserId: "141981764",
              },
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/preferences") {
          return new Response(
            JSON.stringify({
              mainSlot: "topLeft",
              slots: [
                { active: true, label: "Host", slot: "topLeft" },
                { active: true, label: "Guest", slot: "topRight" },
                { active: false, label: "", slot: "bottomLeft" },
                { active: false, label: "", slot: "bottomRight" },
              ],
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (
          input.toString() === "/api/multicam/enable" &&
          init?.method === "POST"
        ) {
          return new Response(
            JSON.stringify({
              active: true,
              cameras: [
                { label: "Host", slot: "topLeft" },
                { label: "Guest", slot: "topRight" },
              ],
              expiresAt: "2099-01-01T00:00:00.000Z",
              layout: "2x2",
              mainSlot: "topLeft",
              protocolVersion: 1,
              revision: 1,
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/multicam") {
          return new Response(JSON.stringify({ active: false }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Multicam" }),
    );

    expect(await screen.findByText("Live revision 1")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/multicam/enable", {
      method: "POST",
    });
  });

  it("distinguishes an expired session from an active session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              streamer: {
                login: "camera_captain",
                twitchUserId: "141981764",
              },
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/preferences") {
          return new Response(
            JSON.stringify({
              mainSlot: "topLeft",
              slots: [
                { active: true, label: "Host", slot: "topLeft" },
                { active: true, label: "Guest", slot: "topRight" },
                { active: false, label: "", slot: "bottomLeft" },
                { active: false, label: "", slot: "bottomRight" },
              ],
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/multicam") {
          return new Response(
            JSON.stringify({
              active: true,
              hasUnpublishedChanges: false,
              live: {
                active: true,
                cameras: [
                  { label: "Host", slot: "topLeft" },
                  { label: "Guest", slot: "topRight" },
                ],
                expiresAt: "2000-01-01T00:00:00.000Z",
                layout: "2x2",
                mainSlot: "topLeft",
                protocolVersion: 1,
                revision: 2,
              },
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Multicam session expired" }),
    ).toBeTruthy();
    expect(screen.getByText(/enable Multicam again/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Re-enable Multicam" }),
    ).toBeTruthy();
    expect(screen.queryByText("Live revision 2")).toBeNull();
  });

  it("explains how to recover when activation finds the streamer offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              streamer: {
                login: "camera_captain",
                twitchUserId: "141981764",
              },
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/preferences") {
          return new Response(
            JSON.stringify({
              mainSlot: "topLeft",
              slots: [
                { active: true, label: "Host", slot: "topLeft" },
                { active: true, label: "Guest", slot: "topRight" },
                { active: false, label: "", slot: "bottomLeft" },
                { active: false, label: "", slot: "bottomRight" },
              ],
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (
          input.toString() === "/api/multicam/enable" &&
          init?.method === "POST"
        ) {
          return new Response(
            JSON.stringify({
              code: "TWITCH_STREAM_OFFLINE",
              message: "Start your Twitch stream first.",
            }),
            { headers: { "Content-Type": "application/json" }, status: 409 },
          );
        }
        if (input.toString() === "/api/multicam") {
          return new Response(JSON.stringify({ active: false }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Multicam" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Start your Twitch stream first.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/go live on Twitch, then retry activation/i),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Retry activation" }),
    ).toBeTruthy();
  });

  it("offers an actionable recovery when Twitch authentication fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              code: "TWITCH_AUTH_FAILED",
              message: "Twitch login could not be verified.",
            }),
            { status: 502 },
          );
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: "Twitch sign-in needs attention",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/if Twitch login keeps failing.*allow cookies/i),
    ).toBeTruthy();
    const retry = screen.getByRole("link", {
      name: "Try Twitch sign-in again",
    });
    expect(retry.getAttribute("href")).toBe("/auth/twitch");
  });

  it("recovers session status without discarding saved camera preferences", async () => {
    let statusRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              streamer: {
                login: "camera_captain",
                twitchUserId: "141981764",
              },
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/preferences") {
          return new Response(
            JSON.stringify({
              mainSlot: "topLeft",
              slots: [
                { active: true, label: "Host", slot: "topLeft" },
                { active: true, label: "Guest", slot: "topRight" },
                { active: false, label: "", slot: "bottomLeft" },
                { active: false, label: "", slot: "bottomRight" },
              ],
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/multicam") {
          statusRequests += 1;
          if (statusRequests === 1) {
            return new Response("Service unavailable", { status: 503 });
          }
          return new Response(JSON.stringify({ active: false }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: "Live session status unavailable",
      }),
    ).toBeTruthy();
    expect(screen.getByText(/saved camera setup is safe/i)).toBeTruthy();
    expect(screen.getByDisplayValue("Host")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Retry session status" }),
    );
    expect(await screen.findByText("Multicam is inactive")).toBeTruthy();
  });

  it("provides recovery steps for login, offline, expiry, and public-session mismatch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              code: "NOT_AUTHENTICATED",
              message: "Sign in with Twitch to continue.",
            }),
            { status: 401 },
          );
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    render(<App />);

    const troubleshooting = screen.getByRole("region", {
      name: "Troubleshooting",
    });
    expect(within(troubleshooting).getByText("Twitch login fails")).toBeTruthy();
    expect(within(troubleshooting).getByText("Activation says offline")).toBeTruthy();
    expect(within(troubleshooting).getByText("Session expired")).toBeTruthy();
    expect(
      within(troubleshooting).getByText("Viewers see the wrong session"),
    ).toBeTruthy();
    expect(
      within(troubleshooting).getByText(/same channel and current broadcast/i),
    ).toBeTruthy();
    expect(
      within(troubleshooting).getByText(/disable Multicam and enable it again/i),
    ).toBeTruthy();
  });

  it("distinguishes the live revision from saved preferences and prevents no-op updates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              streamer: {
                login: "camera_captain",
                twitchUserId: "141981764",
              },
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/preferences") {
          return new Response(
            JSON.stringify({
              mainSlot: "topLeft",
              slots: [
                { active: true, label: "Host", slot: "topLeft" },
                { active: true, label: "Guest", slot: "topRight" },
                { active: false, label: "", slot: "bottomLeft" },
                { active: false, label: "", slot: "bottomRight" },
              ],
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (
          input.toString() === "/api/multicam" &&
          init?.method === "DELETE"
        ) {
          return new Response(JSON.stringify({ active: false }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        }
        if (input.toString() === "/api/multicam") {
          return new Response(
            JSON.stringify({
              active: true,
              hasUnpublishedChanges: false,
              live: {
                active: true,
                cameras: [
                  { label: "Host", slot: "topLeft" },
                  { label: "Guest", slot: "topRight" },
                ],
                expiresAt: "2099-01-01T00:00:00.000Z",
                layout: "2x2",
                mainSlot: "topLeft",
                protocolVersion: 1,
                revision: 3,
              },
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    render(<App />);

    expect(await screen.findByText("Live revision 3")).toBeTruthy();
    expect(screen.getByText("No unpublished changes")).toBeTruthy();
    expect(
      (screen.getByRole("button", {
        name: "Update Live Configuration",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", {
        name: "Disable Multicam",
      }) as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Disable Multicam" }));
    expect(await screen.findByText("Multicam is inactive")).toBeTruthy();
  });

  it("publishes saved draft preferences from the live configuration panel", async () => {
    const live = {
      active: true as const,
      cameras: [
        { label: "Host", slot: "topLeft" },
        { label: "Guest", slot: "topRight" },
      ],
      expiresAt: "2099-01-01T00:00:00.000Z",
      layout: "2x2",
      mainSlot: "topLeft",
      protocolVersion: 1,
      revision: 3,
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              streamer: { login: "camera_captain", twitchUserId: "141981764" },
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/preferences") {
          return new Response(
            JSON.stringify({
              mainSlot: "topLeft",
              slots: [
                { active: true, label: "Host", slot: "topLeft" },
                { active: true, label: "Guest", slot: "topRight" },
                { active: false, label: "", slot: "bottomLeft" },
                { active: false, label: "", slot: "bottomRight" },
              ],
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (
          input.toString() === "/api/multicam/publish" &&
          init?.method === "POST"
        ) {
          return new Response(JSON.stringify({ ...live, revision: 4 }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        }
        if (input.toString() === "/api/multicam") {
          return new Response(
            JSON.stringify({
              active: true,
              hasUnpublishedChanges: true,
              live,
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Update Live Configuration",
      }),
    );

    expect(await screen.findByText("Live revision 4")).toBeTruthy();
    expect(screen.getByText("No unpublished changes")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/multicam/publish", {
      method: "POST",
    });
  });

  it("shows that it is connected to the Multicam API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      ),
    );

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Twitch Multicam" }),
    ).toBeTruthy();
    expect(await screen.findByText("API connected")).toBeTruthy();
  });

  it("offers Twitch sign-in when there is no dashboard session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              code: "NOT_AUTHENTICATED",
              message: "Sign in with Twitch to continue.",
            }),
            { status: 401 },
          );
        }

        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    render(<App />);

    const signIn = await screen.findByRole("link", {
      name: "Sign in with Twitch",
    });
    expect(signIn.getAttribute("href")).toBe("/auth/twitch");
  });

  it("displays the authenticated streamer's Twitch identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              streamer: {
                login: "camera_captain",
                twitchUserId: "141981764",
              },
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    render(<App />);

    expect(
      await screen.findByText("Signed in as camera_captain"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Sign in with Twitch" }),
    ).toBeNull();
  });

  it("shows four fixed camera slots and renders their labels as plain text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              streamer: {
                login: "camera_captain",
                twitchUserId: "141981764",
              },
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/preferences") {
          return new Response(
            JSON.stringify({
              mainSlot: "topLeft",
              slots: [
                {
                  active: true,
                  label: "<img src=x onerror=alert(1)>",
                  slot: "topLeft",
                },
                { active: true, label: "Guest", slot: "topRight" },
                { active: false, label: "", slot: "bottomLeft" },
                { active: false, label: "", slot: "bottomRight" },
              ],
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole("group", { name: "Top left camera" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "Top right camera" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "Bottom left camera" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "Bottom right camera" }),
    ).toBeTruthy();
    expect(
      (
        within(
          screen.getByRole("group", { name: "Top left camera" }),
        ).getByRole("textbox") as HTMLInputElement
      ).value,
    ).toBe("<img src=x onerror=alert(1)>");
    expect(document.querySelector("img")).toBeNull();
  });

  it("autosaves active cameras, labels, and the main camera as a draft", async () => {
    let savedBody: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              streamer: {
                login: "camera_captain",
                twitchUserId: "141981764",
              },
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/preferences" && init?.method === "PUT") {
          savedBody = JSON.parse(init.body as string);
          return new Response(JSON.stringify(savedBody), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        }
        if (input.toString() === "/api/preferences") {
          return new Response(
            JSON.stringify({
              mainSlot: "topLeft",
              slots: [
                { active: true, label: "Host", slot: "topLeft" },
                { active: true, label: "Guest", slot: "topRight" },
                { active: false, label: "", slot: "bottomLeft" },
                { active: false, label: "", slot: "bottomRight" },
              ],
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    render(<App />);
    const bottomLeft = await screen.findByRole("group", {
      name: "Bottom left camera",
    });
    fireEvent.click(within(bottomLeft).getByRole("checkbox"));
    fireEvent.change(within(bottomLeft).getByRole("textbox"), {
      target: { value: "Side view" },
    });
    fireEvent.click(within(bottomLeft).getByRole("radio"));
    await waitFor(() => {
      expect(savedBody).toEqual({
        mainSlot: "bottomLeft",
        slots: [
          { active: true, label: "Host", slot: "topLeft" },
          { active: true, label: "Guest", slot: "topRight" },
          { active: true, label: "Side view", slot: "bottomLeft" },
          { active: false, label: "", slot: "bottomRight" },
        ],
      });
    });
    expect(await screen.findByText("Preferences saved.")).toBeTruthy();
  });

  it("offers a valid two-camera starting point to a new streamer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              streamer: {
                login: "new_streamer",
                twitchUserId: "24680",
              },
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/preferences") {
          return new Response(
            JSON.stringify({
              code: "PREFERENCES_NOT_FOUND",
              message: "Camera preferences have not been saved yet.",
            }),
            { status: 404 },
          );
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    render(<App />);

    const topLeft = await screen.findByRole("group", {
      name: "Top left camera",
    });
    const topRight = screen.getByRole("group", {
      name: "Top right camera",
    });
    expect(
      (within(topLeft).getByRole("checkbox") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (within(topRight).getByRole("checkbox") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (within(topLeft).getByRole("radio") as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("shows field-level validation feedback returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (input.toString() === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              streamer: {
                login: "camera_captain",
                twitchUserId: "141981764",
              },
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        if (input.toString() === "/api/preferences" && init?.method === "PUT") {
          return new Response(
            JSON.stringify({
              code: "INVALID_PREFERENCES",
              issues: [
                {
                  code: "EMPTY_CAMERA_LABEL",
                  message: "Enter a label for each active camera.",
                  path: ["slots", 1, "label"],
                },
                {
                  code: "INVALID_CAMERA_COUNT",
                  message: "Activate between two and four cameras.",
                  path: ["slots"],
                },
                {
                  code: "INACTIVE_MAIN_CAMERA",
                  message: "Select an active camera as the main camera.",
                  path: ["mainSlot"],
                },
              ],
              message: "Camera preferences are invalid.",
            }),
            { headers: { "Content-Type": "application/json" }, status: 400 },
          );
        }
        if (input.toString() === "/api/preferences") {
          return new Response(
            JSON.stringify({
              mainSlot: "topLeft",
              slots: [
                { active: true, label: "Host", slot: "topLeft" },
                { active: true, label: "Guest", slot: "topRight" },
                { active: false, label: "", slot: "bottomLeft" },
                { active: false, label: "", slot: "bottomRight" },
              ],
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    render(<App />);
    await screen.findByRole("group", { name: "Top left camera" });
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

    const topRight = screen.getByRole("group", {
      name: "Top right camera",
    });
    expect(
      await within(topRight).findByText(
        "Enter a label for each active camera.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Activate between two and four cameras."),
    ).toBeTruthy();
    expect(
      screen.getByText("Select an active camera as the main camera."),
    ).toBeTruthy();
  });
});

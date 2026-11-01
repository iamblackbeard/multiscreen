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

  it("edits and saves active cameras, labels, and the main camera", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

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

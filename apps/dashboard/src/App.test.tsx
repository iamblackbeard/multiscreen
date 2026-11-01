// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
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
});

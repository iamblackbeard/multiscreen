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
});

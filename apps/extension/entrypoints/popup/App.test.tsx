// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App.tsx";

afterEach(cleanup);

describe("Multicam extension popup", () => {
  it("identifies the popup and its upcoming purpose", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Twitch Multicam" }),
    ).toBeTruthy();
    expect(screen.getByText("Camera controls are coming next.")).toBeTruthy();
  });
});

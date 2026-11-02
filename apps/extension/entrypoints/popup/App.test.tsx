// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App, type PopupClient } from "./App.tsx";

afterEach(cleanup);

const preferences = {
  mainSlot: "topLeft" as const,
  slots: [
    { active: true, label: "Host", slot: "topLeft" as const },
    { active: true, label: "Guest", slot: "topRight" as const },
    { active: false, label: "", slot: "bottomLeft" as const },
    { active: false, label: "", slot: "bottomRight" as const },
  ],
};

function ownerClient(): PopupClient {
  return {
    disable: vi.fn(),
    enable: vi.fn(),
    loadContext: vi.fn(async () => ({
      kind: "owner" as const,
      multicam: { active: false as const },
      preferences,
    })),
    publish: vi.fn(),
    savePreferences: vi.fn(async (next) => next),
    signIn: vi.fn(),
  };
}

describe("Multicam extension popup", () => {
  it("saves each valid owner edit immediately", async () => {
    const client = ownerClient();
    render(<App client={client} />);
    const hostLabel = await screen.findByRole("textbox", {
      name: "Top left camera label",
    });

    fireEvent.change(hostLabel, { target: { value: "Presenter" } });

    await waitFor(() => {
      expect(client.savePreferences).toHaveBeenCalledWith({
        ...preferences,
        slots: preferences.slots.map((camera) =>
          camera.slot === "topLeft"
            ? { ...camera, label: "Presenter" }
            : camera,
        ),
      });
    });
  });

  it("shows camera information without owner controls on another active channel", async () => {
    const client = ownerClient();
    vi.mocked(client.loadContext).mockResolvedValue({
      kind: "viewer",
      session: {
        active: true,
        cameras: [
          { label: "Host", slot: "topLeft" },
          { label: "Guest", slot: "topRight" },
        ],
        expiresAt: "2026-11-03T12:00:00.000Z",
        layout: "2x2",
        mainSlot: "topLeft",
        protocolVersion: 1,
        revision: 1,
      },
    });

    render(<App client={client} />);

    expect(await screen.findByText("Multicam is active")).toBeTruthy();
    expect(screen.getByText("Host")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enable Multicam" })).toBeNull();
  });

  it("shows a simple inactive state and links to the full dashboard", async () => {
    const client = ownerClient();
    vi.mocked(client.loadContext).mockResolvedValue({ kind: "inactive" });

    render(
      <App
        client={client}
        dashboardUrl="https://dashboard.multicam.test/setup"
      />,
    );

    expect(
      await screen.findByText("Multicam is not active on this channel."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open full dashboard" })).toHaveProperty(
      "href",
      "https://dashboard.multicam.test/setup",
    );
  });

  it("lets an anonymous streamer initiate Twitch sign-in", async () => {
    const client = ownerClient();
    vi.mocked(client.loadContext)
      .mockResolvedValueOnce({ kind: "anonymous" })
      .mockResolvedValueOnce({ kind: "inactive" });

    render(<App client={client} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Sign in with Twitch" }),
    );

    await waitFor(() => expect(client.signIn).toHaveBeenCalledOnce());
  });
});

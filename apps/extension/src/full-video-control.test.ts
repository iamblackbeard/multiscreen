// @vitest-environment jsdom

import { fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type FullVideoControl,
  type FullVideoControlOptions,
  mountFullVideoControl,
} from "./full-video-control.ts";

const removeMountedControls: FullVideoControl[] = [];

function mountControl(
  page: Document,
  options?: FullVideoControlOptions,
): FullVideoControl {
  const removeControl = mountFullVideoControl(page, options);
  removeMountedControls.push(removeControl);
  return removeControl;
}

afterEach(() => {
  removeMountedControls.splice(0).forEach((removeControl) => removeControl());
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("Twitch full-video control", () => {
  it("offers four quadrants and the full composite", () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video style="transform: rotate(1deg); transform-origin: center"></video>
        <div data-a-target="player-controls">
          <button data-a-target="player-settings-button">Settings</button>
        </div>
      </div>
    `;
    const settings = document.querySelector<HTMLButtonElement>(
      '[data-a-target="player-settings-button"]',
    )!;
    const video = document.querySelector<HTMLVideoElement>("video")!;

    mountControl(document);

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));

    expect(
      ui.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual([
      "Top Left",
      "Top Right",
      "Bottom Left",
      "Bottom Right",
      "All Screen",
    ]);
    expect(video.style.transform).toBe("rotate(1deg)");
    expect(video.style.transformOrigin).toBe("center");
  });

  it("fills the player with the top-left quadrant and closes the menu", () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video></video>
        <div style="transform: none">
          <button data-a-target="player-settings-button">Settings</button>
        </div>
      </div>
    `;
    const settings = document.querySelector<HTMLButtonElement>(
      '[data-a-target="player-settings-button"]',
    )!;
    const video = document.querySelector<HTMLVideoElement>("video")!;

    mountControl(document);

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    const trigger = ui.getByRole("button", { name: "Multicam video options" });
    fireEvent.click(trigger);
    fireEvent.click(ui.getByRole("menuitem", { name: "Top Left" }));

    expect(video.style.transform).toBe("scale(2)");
    expect(video.style.transformOrigin).toBe("top left");
    expect(settings.parentElement?.style.transform).toBe("none");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("fills the player with the top-right quadrant", () => {
    document.body.innerHTML = `
      <video></video>
      <button data-a-target="player-settings-button">Settings</button>
    `;
    const settings = document.querySelector<HTMLButtonElement>(
      '[data-a-target="player-settings-button"]',
    )!;
    const video = document.querySelector<HTMLVideoElement>("video")!;
    mountControl(document);

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "Top Right" }));

    expect(video.style.transform).toBe("scale(2)");
    expect(video.style.transformOrigin).toBe("top right");
  });

  it("fills the player with the bottom-left quadrant", () => {
    document.body.innerHTML = `
      <video></video>
      <button data-a-target="player-settings-button">Settings</button>
    `;
    const settings = document.querySelector<HTMLButtonElement>(
      '[data-a-target="player-settings-button"]',
    )!;
    const video = document.querySelector<HTMLVideoElement>("video")!;
    mountControl(document);

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "Bottom Left" }));

    expect(video.style.transform).toBe("scale(2)");
    expect(video.style.transformOrigin).toBe("bottom left");
  });

  it("fills the player with the bottom-right quadrant", () => {
    document.body.innerHTML = `
      <video></video>
      <button data-a-target="player-settings-button">Settings</button>
    `;
    const settings = document.querySelector<HTMLButtonElement>(
      '[data-a-target="player-settings-button"]',
    )!;
    const video = document.querySelector<HTMLVideoElement>("video")!;
    mountControl(document);

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "Bottom Right" }));

    expect(video.style.transform).toBe("scale(2)");
    expect(video.style.transformOrigin).toBe("bottom right");
  });

  it("restores the uncropped video when All Screen is selected", () => {
    document.body.innerHTML = `
      <video style="transform: rotate(1deg); transform-origin: center"></video>
      <button data-a-target="player-settings-button">Settings</button>
    `;
    const settings = document.querySelector<HTMLButtonElement>(
      '[data-a-target="player-settings-button"]',
    )!;
    const video = document.querySelector<HTMLVideoElement>("video")!;
    mountControl(document);

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    const trigger = ui.getByRole("button", { name: "Multicam video options" });
    fireEvent.click(trigger);
    fireEvent.click(ui.getByRole("menuitem", { name: "Bottom Right" }));
    fireEvent.click(trigger);
    fireEvent.click(ui.getByRole("menuitem", { name: "All Screen" }));

    expect(video.style.transform).toBe("rotate(1deg)");
    expect(video.style.transformOrigin).toBe("center");
  });

  it("restores the uncropped video when the control is removed", () => {
    document.body.innerHTML = `
      <video style="transform: rotate(1deg); transform-origin: center"></video>
      <button data-a-target="player-settings-button">Settings</button>
    `;
    const settings = document.querySelector<HTMLButtonElement>(
      '[data-a-target="player-settings-button"]',
    )!;
    const video = document.querySelector<HTMLVideoElement>("video")!;
    const removeControl = mountControl(document);

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "Top Left" }));
    removeControl();

    expect(video.style.transform).toBe("rotate(1deg)");
    expect(video.style.transformOrigin).toBe("center");
  });

  it("suspends the crop and camera control when an advertisement starts", async () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video style="transform: rotate(1deg); transform-origin: center"></video>
        <button data-a-target="player-settings-button">Settings</button>
      </div>
    `;
    const player = document.querySelector<HTMLElement>(
      '[data-a-target="video-player"]',
    )!;
    const settings = document.querySelector<HTMLButtonElement>(
      '[data-a-target="player-settings-button"]',
    )!;
    const video = document.querySelector<HTMLVideoElement>("video")!;
    mountControl(document);

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "Bottom Right" }));

    player.insertAdjacentHTML(
      "beforeend",
      '<span data-a-target="video-ad-label">Advertisement</span>',
    );

    await waitFor(() => {
      expect(video.style.transform).toBe("rotate(1deg)");
      expect(video.style.transformOrigin).toBe("center");
      expect(control.hidden).toBe(true);
    });
  });

  it("mounts with the camera control suspended during an advertisement", () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video></video>
        <button data-a-target="player-settings-button">Settings</button>
        <span data-a-target="video-ad-label">Advertisement</span>
      </div>
    `;
    const settings = document.querySelector<HTMLButtonElement>(
      '[data-a-target="player-settings-button"]',
    )!;

    mountControl(document);

    const control = settings.previousElementSibling as HTMLElement;
    expect(control.hidden).toBe(true);
  });

  it("restores the remembered quadrant when an advertisement ends", async () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video></video>
        <button data-a-target="player-settings-button">Settings</button>
      </div>
    `;
    const player = document.querySelector<HTMLElement>(
      '[data-a-target="video-player"]',
    )!;
    const settings = document.querySelector<HTMLButtonElement>(
      '[data-a-target="player-settings-button"]',
    )!;
    const video = document.querySelector<HTMLVideoElement>("video")!;
    mountControl(document);

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "Bottom Left" }));
    player.insertAdjacentHTML(
      "beforeend",
      '<span data-a-target="video-ad-label">Advertisement</span>',
    );
    const advertisement = player.querySelector<HTMLElement>(
      '[data-a-target="video-ad-label"]',
    )!;

    await waitFor(() => expect(control.hidden).toBe(true));
    advertisement.remove();

    await waitFor(() => {
      expect(video.style.transform).toBe("scale(2)");
      expect(video.style.transformOrigin).toBe("bottom left");
      expect(control.hidden).toBe(false);
    });
  });

  it("stays suspended when Multicam state is invalid after an advertisement", async () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video></video>
        <button data-a-target="player-settings-button">Settings</button>
      </div>
    `;
    let stateIsValid = true;
    const isMulticamStateValid = vi.fn(() => stateIsValid);
    const player = document.querySelector<HTMLElement>(
      '[data-a-target="video-player"]',
    )!;
    const settings = document.querySelector<HTMLButtonElement>(
      '[data-a-target="player-settings-button"]',
    )!;
    const video = document.querySelector<HTMLVideoElement>("video")!;
    mountControl(document, { isMulticamStateValid });

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "Top Right" }));
    player.insertAdjacentHTML(
      "beforeend",
      '<span data-a-target="video-ad-label">Advertisement</span>',
    );
    const advertisement = player.querySelector<HTMLElement>(
      '[data-a-target="video-ad-label"]',
    )!;

    await waitFor(() => expect(control.hidden).toBe(true));
    stateIsValid = false;
    advertisement.remove();

    await waitFor(() => expect(isMulticamStateValid).toHaveBeenCalled());
    await waitFor(() => {
      expect(video.style.transform).toBe("");
      expect(video.style.transformOrigin).toBe("");
      expect(control.hidden).toBe(true);
    });
  });

  it("keeps rebuilt Twitch controls suspended after invalid post-ad state", async () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video></video>
        <button data-a-target="player-settings-button">Settings</button>
      </div>
    `;
    let stateIsValid = true;
    const isMulticamStateValid = vi.fn(() => stateIsValid);
    const player = document.querySelector<HTMLElement>(
      '[data-a-target="video-player"]',
    )!;
    const settings = document.querySelector<HTMLButtonElement>(
      '[data-a-target="player-settings-button"]',
    )!;
    mountControl(document, { isMulticamStateValid });

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "Top Left" }));
    player.innerHTML = `
      <video></video>
      <button data-a-target="player-settings-button">Settings</button>
      <span data-a-target="video-ad-label">Advertisement</span>
    `;

    await waitFor(() => expect(control.isConnected).toBe(false));
    stateIsValid = false;
    player.querySelector('[data-a-target="video-ad-label"]')?.remove();

    await waitFor(() => expect(isMulticamStateValid).toHaveBeenCalled());
    const replacementSettings = player.querySelector<HTMLElement>(
      '[data-a-target="player-settings-button"]',
    )!;
    await waitFor(() => {
      const replacementControl =
        replacementSettings.previousElementSibling as HTMLElement;
      expect(replacementControl.dataset.multicamFullVideoControl).toBe("");
      expect(replacementControl.hidden).toBe(true);
    });
    expect(player.querySelector<HTMLVideoElement>("video")?.style.transform).toBe(
      "",
    );
  });

  it("keeps All Screen uncropped through an advertisement", async () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video></video>
        <button data-a-target="player-settings-button">Settings</button>
      </div>
    `;
    const player = document.querySelector<HTMLElement>(
      '[data-a-target="video-player"]',
    )!;
    const settings = document.querySelector<HTMLButtonElement>(
      '[data-a-target="player-settings-button"]',
    )!;
    const video = document.querySelector<HTMLVideoElement>("video")!;
    mountControl(document);

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "All Screen" }));
    player.insertAdjacentHTML(
      "beforeend",
      '<span data-a-target="video-ad-label">Advertisement</span>',
    );
    const advertisement = player.querySelector<HTMLElement>(
      '[data-a-target="video-ad-label"]',
    )!;

    await waitFor(() => expect(control.hidden).toBe(true));
    advertisement.remove();

    await waitFor(() => expect(control.hidden).toBe(false));
    expect(video.style.transform).toBe("");
    expect(video.style.transformOrigin).toBe("");
  });

  it("restores the camera button when Twitch rebuilds its controls", async () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video></video>
        <button data-a-target="player-settings-button">Settings</button>
      </div>
    `;
    mountControl(document);

    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video></video>
        <button data-a-target="player-settings-button">Settings</button>
      </div>
    `;
    const replacementSettings = document.querySelector<HTMLElement>(
      '[data-a-target="player-settings-button"]',
    )!;

    await waitFor(() => {
      const control = replacementSettings.previousElementSibling as HTMLElement;
      expect(control.dataset.multicamFullVideoControl).toBe("");
    });
  });

  it("keeps exactly one working camera control through repeated control rebuilds", async () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video></video>
        <div data-a-target="player-controls">
          <button data-a-target="player-settings-button">Settings</button>
        </div>
      </div>
    `;
    const player = document.querySelector<HTMLElement>(
      '[data-a-target="video-player"]',
    )!;
    mountControl(document);

    for (let rebuild = 0; rebuild < 2; rebuild += 1) {
      player.querySelector('[data-a-target="player-controls"]')?.remove();
      player.insertAdjacentHTML(
        "beforeend",
        `<div data-a-target="player-controls">
          <button data-a-target="player-settings-button">Settings</button>
        </div>`,
      );
      await waitFor(() =>
        expect(
          document.querySelectorAll("[data-multicam-full-video-control]"),
        ).toHaveLength(1),
      );
    }

    const control = document.querySelector<HTMLElement>(
      "[data-multicam-full-video-control]",
    )!;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    const trigger = ui.getByRole("button", { name: "Multicam video options" });
    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(ui.getAllByRole("menu")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Published session integration
// ---------------------------------------------------------------------------

describe("Twitch full-video control with published session", () => {
  function setupPlayer() {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video></video>
        <button data-a-target="player-settings-button">Settings</button>
      </div>
    `;
    const settings = document.querySelector<HTMLButtonElement>(
      '[data-a-target="player-settings-button"]',
    )!;
    const video = document.querySelector<HTMLVideoElement>("video")!;
    return { settings, video };
  }

  const activeSession = {
    active: true as const,
    cameras: [
      { label: "Host", slot: "topLeft" as const },
      { label: "Close-up", slot: "topRight" as const },
      { label: "Wide", slot: "bottomRight" as const },
    ],
    expiresAt: "2099-01-01T00:00:00.000Z",
    layout: "2x2" as const,
    mainSlot: "topRight" as const,
    protocolVersion: 1 as const,
    revision: 1,
  };

  it("shows published camera labels instead of hardcoded quadrant names", () => {
    const { settings } = setupPlayer();

    mountControl(document, { session: activeSession });

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));

    expect(
      ui.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Host", "Close-up", "Wide", "Show Grid"]);
  });

  it("starts with the published main camera selected", () => {
    const { settings, video } = setupPlayer();

    mountControl(document, { session: activeSession });

    const control = settings.previousElementSibling as HTMLElement;
    expect(control).toBeDefined();
    // main camera is topRight → scale(2) with top right origin
    expect(video.style.transform).toBe("scale(2)");
    expect(video.style.transformOrigin).toBe("top right");
  });

  it("Show Grid restores the uncropped composite", () => {
    const { settings, video } = setupPlayer();

    mountControl(document, { session: activeSession });

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "Show Grid" }));

    expect(video.style.transform).toBe("");
  });

  it("selecting a published camera label crops to that slot", () => {
    const { settings, video } = setupPlayer();

    mountControl(document, { session: activeSession });

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "Host" }));

    expect(video.style.transform).toBe("scale(2)");
    expect(video.style.transformOrigin).toBe("top left");
  });

  it("reapplies the current selection when Twitch replaces the active video", async () => {
    const { settings, video } = setupPlayer();
    mountControl(document, { session: activeSession });
    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "Host" }));

    const replacement = document.createElement("video");
    video.replaceWith(replacement);

    await waitFor(() => {
      expect(replacement.style.transform).toBe("scale(2)");
      expect(replacement.style.transformOrigin).toBe("top left");
    });
    expect(video.style.transform).toBe("");
    expect(video.style.transformOrigin).toBe("");
  });

  it("retains the current crop through resize and fullscreen transitions", () => {
    const { video } = setupPlayer();
    mountControl(document, { session: activeSession });

    video.style.transform = "";
    video.style.transformOrigin = "";
    window.dispatchEvent(new Event("resize"));
    expect(video.style.transform).toBe("scale(2)");
    expect(video.style.transformOrigin).toBe("top right");

    video.style.transform = "";
    video.style.transformOrigin = "";
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(video.style.transform).toBe("scale(2)");
    expect(video.style.transformOrigin).toBe("top right");
  });

  it("retains the current crop when the Twitch player itself resizes", () => {
    let notifyResize = () => {};
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () => callback([], this as unknown as ResizeObserver);
      }
      disconnect() {}
      observe() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const { video } = setupPlayer();
    mountControl(document, { session: activeSession });

    video.style.transform = "";
    video.style.transformOrigin = "";
    notifyResize();

    expect(video.style.transform).toBe("scale(2)");
    expect(video.style.transformOrigin).toBe("top right");
  });

  it("keeps a selected camera when it remains active in a new revision", () => {
    const { settings, video } = setupPlayer();
    const controlApi = mountControl(document, { session: activeSession });
    let control = settings.previousElementSibling as HTMLElement;
    let ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "Host" }));

    controlApi.updateSession({
      ...activeSession,
      cameras: [
        { label: "Presenter", slot: "topLeft" },
        { label: "Close-up", slot: "topRight" },
        { label: "Wide", slot: "bottomRight" },
      ],
      mainSlot: "bottomRight",
      revision: 2,
    });

    control = settings.previousElementSibling as HTMLElement;
    ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    expect(ui.getByRole("menuitem", { name: "Presenter" })).toBeTruthy();
    expect(video.style.transform).toBe("scale(2)");
    expect(video.style.transformOrigin).toBe("top left");
  });

  it("moves an unavailable selection to the new main camera with a notice", () => {
    const { settings, video } = setupPlayer();
    const controlApi = mountControl(document, { session: activeSession });
    let control = settings.previousElementSibling as HTMLElement;
    let ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "Host" }));

    controlApi.updateSession({
      ...activeSession,
      cameras: [
        { label: "Close-up", slot: "topRight" },
        { label: "Wide", slot: "bottomRight" },
      ],
      mainSlot: "topRight",
      revision: 2,
    });

    control = settings.previousElementSibling as HTMLElement;
    ui = within(control.shadowRoot as unknown as HTMLElement);
    expect(video.style.transform).toBe("scale(2)");
    expect(video.style.transformOrigin).toBe("top right");
    expect(ui.getByRole("status").textContent).toBe(
      "That camera is no longer live. Switched to Close-up.",
    );
  });

  it("removes viewer controls and transforms when Multicam is disabled", () => {
    const { settings, video } = setupPlayer();
    const controlApi = mountControl(document, { session: activeSession });
    expect(video.style.transform).toBe("scale(2)");

    controlApi.updateSession({ active: false });

    expect(
      document.querySelector("[data-multicam-full-video-control]"),
    ).toBeNull();
    expect(video.style.transform).toBe("");
    expect(video.style.transformOrigin).toBe("");
  });

  it("does not resurrect stale controls after Multicam becomes inactive", async () => {
    const { video } = setupPlayer();
    const controlApi = mountControl(document, { session: activeSession });
    controlApi.updateSession({ active: false });

    document.body.append(document.createElement("div"));
    await Promise.resolve();
    await Promise.resolve();

    expect(
      document.querySelector("[data-multicam-full-video-control]"),
    ).toBeNull();
    expect(video.style.transform).toBe("");
    expect(video.style.transformOrigin).toBe("");
  });

  it("does not mount the control when session is inactive", () => {
    const { settings } = setupPlayer();

    mountControl(document, { session: { active: false } });

    // No control should have been inserted before settings
    const previous = settings.previousElementSibling as HTMLElement | null;
    expect(previous?.dataset?.multicamFullVideoControl).toBeUndefined();
  });

  it("starts and later removes controls as polling changes session activity", () => {
    const { video } = setupPlayer();
    const controlApi = mountControl(document, { session: { active: false } });

    controlApi.updateSession(activeSession);
    expect(
      document.querySelector("[data-multicam-full-video-control]"),
    ).toBeTruthy();
    expect(video.style.transformOrigin).toBe("top right");

    controlApi.updateSession({ active: false });
    expect(
      document.querySelector("[data-multicam-full-video-control]"),
    ).toBeNull();
    expect(video.style.transform).toBe("");
  });

  it("does not mount the control when session is absent", () => {
    const { settings } = setupPlayer();

    mountControl(document, { session: null });

    const previous = settings.previousElementSibling as HTMLElement | null;
    expect(previous?.dataset?.multicamFullVideoControl).toBeUndefined();
  });

  it("leaves Twitch unchanged and reports a missing settings anchor", () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video style="transform: rotate(1deg); transform-origin: center"></video>
      </div>
    `;
    const video = document.querySelector<HTMLVideoElement>("video")!;
    const reportUnsupported = vi.fn();

    mountControl(document, { session: activeSession, reportUnsupported });

    expect(reportUnsupported).toHaveBeenCalledWith("missing-settings-anchor");
    expect(video.style.transform).toBe("rotate(1deg)");
    expect(video.style.transformOrigin).toBe("center");
    expect(
      document.querySelector("[data-multicam-full-video-control]"),
    ).toBeNull();
  });

  it("leaves Twitch unchanged when player anchors are ambiguous", () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video></video>
        <button data-a-target="player-settings-button">Settings</button>
      </div>
      <div data-a-target="video-player">
        <video></video>
        <button data-a-target="player-settings-button">Settings</button>
      </div>
    `;
    const reportUnsupported = vi.fn();

    mountControl(document, { session: activeSession, reportUnsupported });

    expect(reportUnsupported).toHaveBeenCalledWith(
      "ambiguous-settings-anchor",
    );
    expect(
      [...document.querySelectorAll<HTMLVideoElement>("video")].map(
        (video) => video.style.transform,
      ),
    ).toEqual(["", ""]);
    expect(
      document.querySelector("[data-multicam-full-video-control]"),
    ).toBeNull();
  });

  it("does not add controls when the active video cannot be identified", () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <button data-a-target="player-settings-button">Settings</button>
      </div>
    `;
    const reportUnsupported = vi.fn();

    mountControl(document, { session: activeSession, reportUnsupported });

    expect(reportUnsupported).toHaveBeenCalledWith("missing-video");
    expect(
      document.querySelector("[data-multicam-full-video-control]"),
    ).toBeNull();
  });

  it("does not guess between ambiguous player videos", () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video></video>
        <video></video>
        <button data-a-target="player-settings-button">Settings</button>
      </div>
    `;
    const reportUnsupported = vi.fn();

    mountControl(document, { session: activeSession, reportUnsupported });

    expect(reportUnsupported).toHaveBeenCalledWith("ambiguous-video");
    expect(
      [...document.querySelectorAll<HTMLVideoElement>("video")].map(
        (video) => video.style.transform,
      ),
    ).toEqual(["", ""]);
    expect(
      document.querySelector("[data-multicam-full-video-control]"),
    ).toBeNull();
  });

  it("fails open when the active video disappears after mounting", async () => {
    const { video } = setupPlayer();
    const reportUnsupported = vi.fn();
    mountControl(document, { session: activeSession, reportUnsupported });
    expect(video.style.transform).toBe("scale(2)");

    video.remove();

    await waitFor(() => {
      expect(reportUnsupported).toHaveBeenCalledWith("missing-video");
      expect(
        document.querySelector("[data-multicam-full-video-control]"),
      ).toBeNull();
    });
    expect(video.style.transform).toBe("");
    expect(video.style.transformOrigin).toBe("");
  });

  it("moves focus into the menu and restores it on Escape", () => {
    const { settings } = setupPlayer();
    mountControl(document, { session: activeSession });
    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    const trigger = ui.getByRole("button", { name: "Multicam video options" });

    fireEvent.click(trigger);

    const firstCamera = ui.getByRole("menuitem", { name: "Host" });
    expect(control.shadowRoot?.activeElement).toBe(firstCamera);

    fireEvent.keyDown(firstCamera, { key: "Escape" });

    expect(ui.queryByRole("menu")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(control.shadowRoot?.activeElement).toBe(trigger);
  });

  it("moves menu focus with Arrow, Home, and End keys", () => {
    const { settings } = setupPlayer();
    mountControl(document, { session: activeSession });
    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    const trigger = ui.getByRole("button", { name: "Multicam video options" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const items = ui.getAllByRole("menuitem");

    expect(control.shadowRoot?.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: "ArrowDown" });
    expect(control.shadowRoot?.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1]!, { key: "End" });
    expect(control.shadowRoot?.activeElement).toBe(items.at(-1));
    fireEvent.keyDown(items.at(-1)!, { key: "Home" });
    expect(control.shadowRoot?.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: "ArrowUp" });
    expect(control.shadowRoot?.activeElement).toBe(items.at(-1));
  });

  it("closes the camera menu when the viewer clicks outside it", () => {
    const { settings } = setupPlayer();
    mountControl(document, { session: activeSession });
    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    const trigger = ui.getByRole("button", { name: "Multicam video options" });
    fireEvent.click(trigger);

    fireEvent.pointerDown(document.body);

    expect(ui.queryByRole("menu")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

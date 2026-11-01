// @vitest-environment jsdom

import { fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { mountFullVideoControl } from "./full-video-control.ts";

afterEach(() => {
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

    mountFullVideoControl(document);

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

    mountFullVideoControl(document);

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
    mountFullVideoControl(document);

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
    mountFullVideoControl(document);

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
    mountFullVideoControl(document);

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
    mountFullVideoControl(document);

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
    const removeControl = mountFullVideoControl(document);

    const control = settings.previousElementSibling as HTMLElement;
    const ui = within(control.shadowRoot as unknown as HTMLElement);
    fireEvent.click(ui.getByRole("button", { name: "Multicam video options" }));
    fireEvent.click(ui.getByRole("menuitem", { name: "Top Left" }));
    removeControl();

    expect(video.style.transform).toBe("rotate(1deg)");
    expect(video.style.transformOrigin).toBe("center");
  });

  it("restores the camera button when Twitch rebuilds its controls", async () => {
    document.body.innerHTML = `
      <div data-a-target="video-player">
        <video></video>
        <button data-a-target="player-settings-button">Settings</button>
      </div>
    `;
    mountFullVideoControl(document);

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
});

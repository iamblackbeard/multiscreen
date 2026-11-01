// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { resolveChannelLogin } from "./channel-url.ts";

describe("Twitch channel URL resolution", () => {
  it("extracts the channel login from a standard channel page", () => {
    expect(resolveChannelLogin("https://www.twitch.tv/camera_captain")).toBe(
      "camera_captain",
    );
  });

  it("is case-insensitive — normalises login to lowercase", () => {
    expect(resolveChannelLogin("https://www.twitch.tv/Camera_Captain")).toBe(
      "camera_captain",
    );
  });

  it("extracts login from a channel page with extra path segments", () => {
    // e.g. /streamer/about, /streamer/schedule
    expect(
      resolveChannelLogin("https://www.twitch.tv/streamer/about"),
    ).toBe("streamer");
  });

  it("returns null for the Twitch homepage", () => {
    expect(resolveChannelLogin("https://www.twitch.tv/")).toBeNull();
  });

  it("returns null for a clip URL", () => {
    expect(
      resolveChannelLogin(
        "https://www.twitch.tv/camera_captain/clip/ExampleClip123",
      ),
    ).toBeNull();
  });

  it("returns null for a VOD URL", () => {
    expect(
      resolveChannelLogin("https://www.twitch.tv/videos/123456789"),
    ).toBeNull();
  });

  it("returns null for the /directory route", () => {
    expect(
      resolveChannelLogin("https://www.twitch.tv/directory/game/Minecraft"),
    ).toBeNull();
  });

  it("returns null for /following", () => {
    expect(
      resolveChannelLogin("https://www.twitch.tv/following"),
    ).toBeNull();
  });

  it("returns null for /browse", () => {
    expect(
      resolveChannelLogin("https://www.twitch.tv/browse"),
    ).toBeNull();
  });

  it("returns null for /search", () => {
    expect(
      resolveChannelLogin("https://www.twitch.tv/search"),
    ).toBeNull();
  });

  it("returns null for /moderator routes", () => {
    expect(
      resolveChannelLogin("https://www.twitch.tv/moderator/streamer"),
    ).toBeNull();
  });

  it("returns null for /subscriptions", () => {
    expect(
      resolveChannelLogin("https://www.twitch.tv/subscriptions"),
    ).toBeNull();
  });
});

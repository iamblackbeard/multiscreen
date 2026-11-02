import {
  popupContextSchema,
  streamerPreferencesSchema,
  type StreamerPreferences,
} from "@multicam/contracts";
import { browser } from "wxt/browser";

import { resolveChannelLogin } from "../../src/channel-url.ts";
import type { PopupMessage } from "../../src/popup-background.ts";
import type { PopupClient } from "./App.tsx";

async function send(message: PopupMessage) {
  return browser.runtime.sendMessage(message) as Promise<unknown>;
}

export function createPopupClient(): PopupClient {
  return {
    disable: () => send({ type: "disable" }),
    enable: () => send({ type: "enable" }),
    async loadContext() {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const channel = tab?.url ? resolveChannelLogin(tab.url) : null;
      const result = await send({ channel, type: "loadContext" });
      if (
        typeof result === "object" &&
        result !== null &&
        "kind" in result &&
        result.kind === "anonymous"
      ) {
        return { kind: "anonymous" as const };
      }
      return popupContextSchema.parse(result);
    },
    publish: () => send({ type: "publish" }),
    async savePreferences(preferences: StreamerPreferences) {
      return streamerPreferencesSchema.parse(
        await send({ preferences, type: "savePreferences" }),
      );
    },
    signIn: () => send({ type: "signIn" }),
  };
}

import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import {
  createPopupMessageHandler,
  type PopupMessage,
} from "../src/popup-background.ts";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "https://api.multicam.tv";

export default defineBackground({
  main() {
    const handleMessage = createPopupMessageHandler({
      apiBaseUrl: API_BASE,
      identity: {
        getRedirectURL: () => browser.identity.getRedirectURL(),
        launchWebAuthFlow: (input) => browser.identity.launchWebAuthFlow(input),
      },
      storage: browser.storage.local,
    });
    browser.runtime.onMessage.addListener((message: PopupMessage) =>
      handleMessage(message),
    );
  },
});

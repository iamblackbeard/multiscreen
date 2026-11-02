import { defineContentScript } from "wxt/utils/define-content-script";

import { requiredApiBaseUrl } from "../src/environment.ts";
import { startTwitchPlayerIntegration } from "../src/twitch-player-integration.ts";

const API_BASE = requiredApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

export default defineContentScript({
  matches: ["https://www.twitch.tv/*"],
  runAt: "document_idle",
  main(context) {
    const stop = startTwitchPlayerIntegration({
      apiBase: API_BASE,
      page: document,
      reportUnsupported(reason) {
        console.warn(`[Multicam] Unsupported Twitch player: ${reason}`);
      },
    });

    context.onInvalidated(() => {
      stop();
    });
  },
});

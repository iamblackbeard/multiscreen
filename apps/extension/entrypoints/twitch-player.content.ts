import { defineContentScript } from "wxt/utils/define-content-script";

import {
  type FullVideoControl,
  mountFullVideoControl,
} from "../src/full-video-control.ts";
import { startViewerConfigurationSync } from "../src/viewer-configuration-sync.ts";

const API_BASE = "https://api.multicam.tv";

export default defineContentScript({
  matches: ["https://www.twitch.tv/*"],
  runAt: "document_idle",
  main(context) {
    let control: FullVideoControl | undefined;
    let controlLogin: string | null = null;
    const stopSync = startViewerConfigurationSync({
      apiBase: API_BASE,
      page: document,
      applySession(login, session) {
        if (context.isInvalid) return;
        if (!login) {
          control?.();
          control = undefined;
          controlLogin = null;
          return;
        }
        if (login !== controlLogin) {
          control?.();
          control = mountFullVideoControl(document, { session });
          controlLogin = login;
          return;
        }
        control?.updateSession(session);
      },
    });

    context.onInvalidated(() => {
      stopSync();
      control?.();
    });
  },
});

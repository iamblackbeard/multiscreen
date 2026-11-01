import { defineContentScript } from "wxt/utils/define-content-script";

import { mountFullVideoControl } from "../src/full-video-control.ts";

export default defineContentScript({
  matches: ["https://www.twitch.tv/*"],
  runAt: "document_idle",
  main(context) {
    const removeControl = mountFullVideoControl(document);
    context.onInvalidated(removeControl);
  },
});

import { defineContentScript } from "wxt/utils/define-content-script";

import { publicMulticamSessionSchema } from "@multicam/contracts";

import { resolveChannelLogin } from "../src/channel-url.ts";
import { mountFullVideoControl } from "../src/full-video-control.ts";

const API_BASE = "https://api.multicam.tv";

async function fetchSession(login: string) {
  try {
    const response = await fetch(
      `${API_BASE}/api/public/channels/${login}/multicam`,
    );
    if (!response.ok) return null;
    const json: unknown = await response.json();
    const parsed = publicMulticamSessionSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export default defineContentScript({
  matches: ["https://www.twitch.tv/*"],
  runAt: "document_idle",
  async main(context) {
    const login = resolveChannelLogin(document.location.href);
    if (!login) {
      // Not a channel page — do not mount any control.
      return;
    }

    const session = await fetchSession(login);

    if (context.isInvalid) return;

    const removeControl = mountFullVideoControl(document, { session });
    context.onInvalidated(removeControl);
  },
});

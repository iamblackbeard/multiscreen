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

    const control = mountFullVideoControl(document, { session });
    let currentSession = session;
    let refreshing = false;

    const refreshSession = async () => {
      if (document.hidden || refreshing || context.isInvalid) return;
      refreshing = true;
      const refreshed = await fetchSession(login);
      refreshing = false;
      if (context.isInvalid) return;
      const nextSession = refreshed ?? { active: false as const };
      const currentRevision = currentSession?.active
        ? currentSession.revision
        : undefined;
      const nextRevision = nextSession.active ? nextSession.revision : undefined;
      if (
        currentSession?.active === nextSession.active &&
        currentRevision === nextRevision
      ) {
        return;
      }
      currentSession = nextSession;
      control.updateSession(nextSession);
    };

    const refreshInterval = window.setInterval(() => {
      void refreshSession();
    }, 5_000);
    const refreshWhenVisible = () => {
      if (!document.hidden) void refreshSession();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    context.onInvalidated(() => {
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
      control();
    });
  },
});

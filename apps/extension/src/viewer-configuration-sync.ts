import {
  publicMulticamSessionSchema,
  type PublicMulticamSession,
} from "@multicam/contracts";

import { resolveChannelLogin } from "./channel-url.ts";

export type ViewerConfigurationSyncOptions = {
  apiBase: string;
  applySession(login: string | null, session: PublicMulticamSession): void;
  fetch?: typeof globalThis.fetch;
  page: Document;
};

export function startViewerConfigurationSync({
  apiBase,
  applySession,
  fetch: fetchImpl = globalThis.fetch,
  page,
}: ViewerConfigurationSyncOptions): () => void {
  let stopped = false;
  let login = resolveChannelLogin(page.location.href);
  let generation = 0;
  let refreshingGeneration: number | undefined;
  let etag: string | null = null;

  const refresh = async (allowHidden = false) => {
    if (
      !login ||
      (page.hidden && !allowHidden) ||
      stopped ||
      refreshingGeneration === generation
    ) {
      return;
    }
    const requestLogin = login;
    const requestGeneration = generation;
    refreshingGeneration = requestGeneration;
    try {
      const headers: Record<string, string> = {};
      if (etag) headers["If-None-Match"] = etag;
      const response = await fetchImpl(
        `${apiBase}/api/public/channels/${requestLogin}/multicam`,
        { headers },
      );
      if (
        stopped ||
        requestGeneration !== generation ||
        requestLogin !== login ||
        response.status === 304
      ) {
        return;
      }

      let session: PublicMulticamSession = { active: false };
      if (response.ok) {
        const parsed = publicMulticamSessionSchema.safeParse(
          await response.json(),
        );
        if (parsed.success) {
          session = parsed.data;
          etag = response.headers.get("ETag");
        }
      }
      applySession(requestLogin, session);
    } catch {
      if (
        !stopped &&
        requestGeneration === generation &&
        requestLogin === login
      ) {
        applySession(requestLogin, { active: false });
      }
    } finally {
      if (refreshingGeneration === requestGeneration) {
        refreshingGeneration = undefined;
      }
    }
  };

  void refresh(true);
  const interval = page.defaultView?.setInterval(() => {
    void refresh();
  }, 5_000);
  const refreshWhenVisible = () => {
    if (!page.hidden) void refresh();
  };
  page.addEventListener("visibilitychange", refreshWhenVisible);
  const navigationObserver = new MutationObserver(() => {
    const nextLogin = resolveChannelLogin(page.location.href);
    if (nextLogin === login) return;
    login = nextLogin;
    generation += 1;
    refreshingGeneration = undefined;
    etag = null;
    applySession(login, { active: false });
    void refresh(true);
  });
  navigationObserver.observe(page.documentElement, {
    childList: true,
    subtree: true,
  });

  return () => {
    stopped = true;
    if (interval !== undefined) page.defaultView?.clearInterval(interval);
    page.removeEventListener("visibilitychange", refreshWhenVisible);
    navigationObserver.disconnect();
  };
}

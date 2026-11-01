import {
  type FullVideoControl,
  type PlayerIntegrationUnsupportedReason,
  mountFullVideoControl,
} from "./full-video-control.ts";
import { startViewerConfigurationSync } from "./viewer-configuration-sync.ts";

export type TwitchPlayerIntegrationOptions = {
  apiBase: string;
  fetch?: typeof globalThis.fetch;
  page: Document;
  reportUnsupported?: (reason: PlayerIntegrationUnsupportedReason) => void;
};

export function startTwitchPlayerIntegration({
  apiBase,
  fetch,
  page,
  reportUnsupported,
}: TwitchPlayerIntegrationOptions): () => void {
  let control: FullVideoControl | undefined;
  let controlLogin: string | null = null;
  const stopSync = startViewerConfigurationSync({
    apiBase,
    page,
    ...(fetch ? { fetch } : {}),
    applySession(login, session) {
      if (!login) {
        control?.();
        control = undefined;
        controlLogin = null;
        return;
      }
      if (login !== controlLogin) {
        control?.();
        control = mountFullVideoControl(page, {
          session,
          ...(reportUnsupported ? { reportUnsupported } : {}),
        });
        controlLogin = login;
        return;
      }
      control?.updateSession(session);
    },
  });

  return () => {
    stopSync();
    control?.();
    control = undefined;
    controlLogin = null;
  };
}

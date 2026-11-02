import express from "express";

import {
  healthResponseSchema,
  type HealthResponse,
} from "@multicam/contracts";

import {
  createAuthHandlers,
  type AuthDependencies,
} from "./auth/auth.ts";
import { createPreferenceHandlers } from "./preferences/preferences.ts";
import type { PreferenceStore } from "./preferences/store.ts";
import { createPopupContextHandler } from "./popup/context.ts";
import {
  createMulticamSessionHandlers,
  type MulticamSessionDependencies,
  createPublicSessionHandler,
} from "./sessions/sessions.ts";

export function createApi(
  authDependencies?: AuthDependencies,
  preferenceStore?: PreferenceStore,
  sessionDependencies?: MulticamSessionDependencies,
) {
  const api = express();
  api.use(express.json());

  api.get("/health", (_request, response) => {
    const health: HealthResponse = { status: "ok" };
    response.json(healthResponseSchema.parse(health));
  });

  // The public lookup is unauthenticated — register it whenever a session
  // store is available, regardless of whether auth dependencies are wired.
  if (sessionDependencies) {
    const publicSession = createPublicSessionHandler(
      sessionDependencies,
    );
    api.get(
      "/api/public/channels/:login/multicam",
      publicSession.lookup,
    );
  }

  if (authDependencies) {
    const auth = createAuthHandlers(authDependencies);
    api.get("/auth/twitch", auth.begin);
    api.get("/auth/twitch/callback", auth.callback);
    api.get("/auth/extension/twitch", auth.beginExtension);
    api.get(
      "/auth/extension/twitch/callback",
      auth.extensionCallback,
    );
    api.post(
      "/api/extension-auth/exchange",
      auth.exchangeExtensionCode,
    );
    api.post(
      "/api/extension-auth/refresh",
      auth.refreshExtensionSession,
    );
    api.get("/api/auth/session", auth.session);
    if (preferenceStore) {
      const preferences = createPreferenceHandlers(
        authDependencies.authStore,
        preferenceStore,
      );
      api.get("/api/preferences", preferences.get);
      api.put("/api/preferences", preferences.put);
      if (sessionDependencies) {
        api.get(
          "/api/popup-context",
          createPopupContextHandler(
            authDependencies.authStore,
            preferenceStore,
            sessionDependencies,
          ),
        );
        const sessions = createMulticamSessionHandlers(
          authDependencies.authStore,
          preferenceStore,
          sessionDependencies,
        );
        api.get("/api/multicam", sessions.status);
        api.delete("/api/multicam", sessions.disable);
        api.post("/api/multicam/enable", sessions.enable);
        api.post("/api/multicam/publish", sessions.publish);
      }
    }
  }

  return api;
}

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

export function createApi(
  authDependencies?: AuthDependencies,
  preferenceStore?: PreferenceStore,
) {
  const api = express();
  api.use(express.json());

  api.get("/health", (_request, response) => {
    const health: HealthResponse = { status: "ok" };
    response.json(healthResponseSchema.parse(health));
  });

  if (authDependencies) {
    const auth = createAuthHandlers(authDependencies);
    api.get("/auth/twitch", auth.begin);
    api.get("/auth/twitch/callback", auth.callback);
    api.get("/api/auth/session", auth.session);
    if (preferenceStore) {
      const preferences = createPreferenceHandlers(
        authDependencies.authStore,
        preferenceStore,
      );
      api.get("/api/preferences", preferences.get);
      api.put("/api/preferences", preferences.put);
    }
  }

  return api;
}

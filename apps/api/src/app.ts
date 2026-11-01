import express from "express";

import {
  healthResponseSchema,
  type HealthResponse,
} from "@multicam/contracts";

import {
  createAuthHandlers,
  type AuthDependencies,
} from "./auth/auth.ts";

export function createApi(authDependencies?: AuthDependencies) {
  const api = express();

  api.get("/health", (_request, response) => {
    const health: HealthResponse = { status: "ok" };
    response.json(healthResponseSchema.parse(health));
  });

  if (authDependencies) {
    const auth = createAuthHandlers(authDependencies);
    api.get("/auth/twitch", auth.begin);
    api.get("/auth/twitch/callback", auth.callback);
    api.get("/api/auth/session", auth.session);
  }

  return api;
}

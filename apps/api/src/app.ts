import express from "express";

import {
  healthResponseSchema,
  type HealthResponse,
} from "@multicam/contracts";

export function createApi() {
  const api = express();

  api.get("/health", (_request, response) => {
    const health: HealthResponse = { status: "ok" };
    response.json(healthResponseSchema.parse(health));
  });

  return api;
}

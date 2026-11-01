import type { AddressInfo } from "node:net";
import { once } from "node:events";

import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "@multicam/contracts";

import { createApi } from "../src/app.ts";

describe("GET /health", () => {
  it("reports that the Multicam API is healthy", async () => {
    const server = createApi().listen(0, "127.0.0.1");

    try {
      await once(server, "listening");
      const address = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}/health`);

      expect(response.status).toBe(200);
      expect(healthResponseSchema.parse(await response.json())).toEqual({
        status: "ok",
      });
    } finally {
      server.close();
    }
  });
});

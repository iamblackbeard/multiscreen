import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createApi } from "../src/app.ts";
import type { MulticamSessionStore } from "../src/sessions/store.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const openServers: Array<{ close(): void }> = [];

afterEach(() => {
  openServers.splice(0).forEach((s) => s.close());
});

function stubSessionStore(
  sessions: Record<string, unknown> = {},
): MulticamSessionStore {
  return {
    async findByChannelLogin(login) {
      const raw = sessions[login];
      if (raw === undefined) return undefined;
      return {
        broadcasterId: "141981764",
        snapshot: raw,
        streamId: "stream-123",
      } as Awaited<ReturnType<MulticamSessionStore["findByChannelLogin"]>>;
    },
    async publish(input) {
      return input.snapshot;
    },
  };
}

async function startPublicApi(sessionStore: MulticamSessionStore) {
  const api = createApi(
    // auth dependencies omitted — public endpoint does not require auth
    undefined,
    undefined,
    {
      sessionStore,
      streamStatus: {
        async findCurrentStream() {
          return { streamId: "stream-123" };
        },
      },
    },
  );
  const server = api.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  openServers.push(server);
  return { baseUrl: `http://127.0.0.1:${port}` };
}

async function publicLookup(baseUrl: string, login: string) {
  return fetch(`${baseUrl}/api/public/channels/${login}/multicam`);
}

// ---------------------------------------------------------------------------
// Contract: active snapshot
// ---------------------------------------------------------------------------

const activeSnapshot = {
  active: true as const,
  cameras: [
    { label: "Host", slot: "topLeft" as const },
    { label: "Close-up", slot: "topRight" as const },
  ],
  expiresAt: "2099-01-01T00:00:00.000Z",
  layout: "2x2" as const,
  mainSlot: "topRight" as const,
  protocolVersion: 1 as const,
  revision: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("public multicam lookup", () => {
  it("returns inactive when no session has been published", async () => {
    const { baseUrl } = await startPublicApi(stubSessionStore({}));

    const response = await publicLookup(baseUrl, "unknown_channel");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ active: false });
  });

  it("returns the active snapshot for a known channel", async () => {
    const { baseUrl } = await startPublicApi(
      stubSessionStore({ streamer42: activeSnapshot }),
    );

    const response = await publicLookup(baseUrl, "streamer42");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(activeSnapshot);
  });

  it("normalises the channel login to lowercase before lookup", async () => {
    const { baseUrl } = await startPublicApi(
      stubSessionStore({ camera_captain: activeSnapshot }),
    );

    const response = await publicLookup(baseUrl, "Camera_Captain");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ active: true });
  });

  it("strips additive fields not in the contract", async () => {
    const withExtras = { ...activeSnapshot, futureField: "ignore me" };
    const { baseUrl } = await startPublicApi(
      stubSessionStore({ streamer: withExtras }),
    );

    const response = await publicLookup(baseUrl, "streamer");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty("futureField");
    expect(body).toMatchObject({ active: true });
  });

  it("returns inactive when the stored snapshot is malformed", async () => {
    const malformed = { active: true, garbage: true };
    const { baseUrl } = await startPublicApi(
      stubSessionStore({ broken: malformed }),
    );

    const response = await publicLookup(baseUrl, "broken");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ active: false });
  });

  it("returns inactive when the stored snapshot has an unsupported protocol version", async () => {
    const unsupported = { ...activeSnapshot, protocolVersion: 99 };
    const { baseUrl } = await startPublicApi(
      stubSessionStore({ futurecaster: unsupported }),
    );

    const response = await publicLookup(baseUrl, "futurecaster");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ active: false });
  });

  it("returns inactive when the session has expired", async () => {
    const expired = {
      ...activeSnapshot,
      expiresAt: "2020-01-01T00:00:00.000Z",
    };
    const { baseUrl } = await startPublicApi(
      stubSessionStore({ oldstreamer: expired }),
    );

    const response = await publicLookup(baseUrl, "oldstreamer");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ active: false });
  });
});

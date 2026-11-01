import {
  activeMulticamSessionSchema,
  inactiveMulticamSessionSchema,
  publicMulticamSessionSchema,
} from "@multicam/contracts";
import type { Request, Response } from "express";

import { authenticatedStreamer } from "../auth/auth.ts";
import type { AuthStore } from "../auth/store.ts";
import type { PreferenceStore } from "../preferences/store.ts";
import type { MulticamSessionStore } from "./store.ts";
import type { TwitchStreamStatusClient } from "./twitch.ts";

export interface MulticamSessionDependencies {
  now?: () => Date;
  sessionStore: MulticamSessionStore;
  streamStatus: TwitchStreamStatusClient;
}

export function createMulticamSessionHandlers(
  authStore: AuthStore,
  preferenceStore: PreferenceStore,
  {
    now = () => new Date(),
    sessionStore,
    streamStatus,
  }: MulticamSessionDependencies,
) {
  return {
    async enable(request: Request, response: Response) {
      const streamer = await authenticatedStreamer(request, authStore);
      if (!streamer) {
        response.status(401).json({
          code: "NOT_AUTHENTICATED",
          message: "Sign in with Twitch to continue.",
        });
        return;
      }
      const preferences = await preferenceStore.find(streamer.twitchUserId);
      if (!preferences) {
        response.status(409).json({
          code: "PREFERENCES_NOT_FOUND",
          message: "Save camera preferences before enabling Multicam.",
        });
        return;
      }
      let stream: { streamId: string } | undefined;
      try {
        stream = await streamStatus.findCurrentStream(
          streamer.twitchUserId,
        );
      } catch {
        response.status(502).json({
          code: "TWITCH_STATUS_UNAVAILABLE",
          message: "Twitch stream status is temporarily unavailable.",
        });
        return;
      }
      if (!stream) {
        response.status(409).json({
          code: "TWITCH_STREAM_OFFLINE",
          message: "Start your Twitch stream first.",
        });
        return;
      }
      const snapshot = activeMulticamSessionSchema.parse({
        active: true,
        cameras: preferences.slots
          .filter((camera) => camera.active)
          .map(({ label, slot }) => ({ label, slot })),
        expiresAt: new Date(now().getTime() + 24 * 60 * 60 * 1_000).toISOString(),
        layout: "2x2",
        mainSlot: preferences.mainSlot,
        protocolVersion: 1,
        revision: 1,
      });
      response.json(
        await sessionStore.publish({
          broadcasterId: streamer.twitchUserId,
          channelLogin: streamer.login.toLowerCase(),
          snapshot,
          streamId: stream.streamId,
        }),
      );
    },
  };
}

/**
 * Public-facing handler that can be mounted without auth dependencies.
 * Defensively safe-parses the stored snapshot: malformed data, unsupported
 * protocol versions, and expired sessions all return an inactive response.
 */
export function createPublicSessionHandler({
  now = () => new Date(),
  sessionStore,
  streamStatus,
}: MulticamSessionDependencies) {
  const inactive = inactiveMulticamSessionSchema.parse({ active: false });

  return {
    async lookup(request: Request, response: Response) {
      const login = String(request.params.login).toLowerCase();

      let raw: Awaited<
        ReturnType<MulticamSessionStore["findByChannelLogin"]>
      >;
      try {
        raw = await sessionStore.findByChannelLogin(login);
      } catch {
        response.json(inactive);
        return;
      }

      if (!raw) {
        response.json(inactive);
        return;
      }
      const parsed = publicMulticamSessionSchema.safeParse(raw.snapshot);
      if (!parsed.success || !parsed.data.active) {
        response.json(inactive);
        return;
      }

      const snapshot = parsed.data;
      if (new Date(snapshot.expiresAt) <= now()) {
        response.json(inactive);
        return;
      }

      if (!raw.streamId) {
        response.json(inactive);
        return;
      }

      let currentStream: { streamId: string } | undefined;
      try {
        currentStream = await streamStatus.findCurrentStream(
          raw.broadcasterId,
        );
      } catch {
        response.json(inactive);
        return;
      }
      if (currentStream?.streamId !== raw.streamId) {
        response.json(inactive);
        return;
      }

      response.json(snapshot);
    },
  };
}

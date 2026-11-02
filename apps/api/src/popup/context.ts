import {
  popupContextSchema,
  publicMulticamSessionSchema,
} from "@multicam/contracts";
import type { Request, Response } from "express";

import { authenticatedStreamer } from "../auth/auth.ts";
import type { AuthStore } from "../auth/store.ts";
import type { PreferenceStore } from "../preferences/store.ts";
import {
  preferencesDifferFromLive,
  type MulticamSessionDependencies,
} from "../sessions/sessions.ts";

export function createPopupContextHandler(
  authStore: AuthStore,
  preferenceStore: PreferenceStore,
  {
    now = () => new Date(),
    sessionStore,
    streamStatus,
  }: MulticamSessionDependencies,
) {
  return async function popupContext(request: Request, response: Response) {
    const streamer = await authenticatedStreamer(request, authStore, now());
    if (!streamer) {
      response.status(401).json({
        code: "NOT_AUTHENTICATED",
        message: "Sign in with Twitch to continue.",
      });
      return;
    }
    const channel =
      typeof request.query.channel === "string"
        ? request.query.channel.trim().toLowerCase()
        : "";
    if (!channel || !streamStatus.findUserByLogin) {
      response.status(400).json({
        code: "INVALID_CHANNEL",
        message: "A Twitch channel is required.",
      });
      return;
    }

    let channelIdentity: Awaited<
      ReturnType<NonNullable<typeof streamStatus.findUserByLogin>>
    >;
    try {
      channelIdentity = await streamStatus.findUserByLogin(channel);
    } catch {
      response.status(502).json({
        code: "TWITCH_IDENTITY_UNAVAILABLE",
        message: "Twitch could not verify the current channel.",
      });
      return;
    }

    if (channelIdentity?.twitchUserId === streamer.twitchUserId) {
      const preferences = await preferenceStore.find(streamer.twitchUserId);
      if (!preferences) {
        response.status(404).json({
          code: "PREFERENCES_NOT_FOUND",
          message: "Camera preferences have not been saved yet.",
        });
        return;
      }
      const active = await sessionStore.findByBroadcasterId(
        streamer.twitchUserId,
      );
      response.json(
        popupContextSchema.parse({
          kind: "owner",
          multicam: active
            ? {
                active: true,
                hasUnpublishedChanges: preferencesDifferFromLive(
                  preferences,
                  active.snapshot,
                ),
                live: active.snapshot,
              }
            : { active: false },
          preferences,
        }),
      );
      return;
    }

    const stored = await sessionStore.findByChannelLogin(channel);
    const parsed = publicMulticamSessionSchema.safeParse(stored?.snapshot);
    if (
      !stored ||
      !parsed.success ||
      !parsed.data.active ||
      new Date(parsed.data.expiresAt) <= now() ||
      !stored.streamId
    ) {
      response.json(popupContextSchema.parse({ kind: "inactive" }));
      return;
    }
    try {
      const currentStream = await streamStatus.findCurrentStream(
        stored.broadcasterId,
      );
      if (currentStream?.streamId !== stored.streamId) {
        response.json(popupContextSchema.parse({ kind: "inactive" }));
        return;
      }
    } catch {
      response.json(popupContextSchema.parse({ kind: "inactive" }));
      return;
    }
    response.json(
      popupContextSchema.parse({ kind: "viewer", session: parsed.data }),
    );
  };
}

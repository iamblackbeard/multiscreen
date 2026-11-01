import { streamerPreferencesSchema } from "@multicam/contracts";
import type { Request, Response } from "express";

import { authenticatedStreamer } from "../auth/auth.ts";
import type { AuthStore } from "../auth/store.ts";
import type { PreferenceStore } from "./store.ts";

export function createPreferenceHandlers(
  authStore: AuthStore,
  preferenceStore: PreferenceStore,
) {
  async function owner(request: Request, response: Response) {
    const streamer = await authenticatedStreamer(request, authStore);
    if (!streamer) {
      response.status(401).json({
        code: "NOT_AUTHENTICATED",
        message: "Sign in with Twitch to continue.",
      });
    }
    return streamer;
  }

  return {
    async get(request: Request, response: Response) {
      const streamer = await owner(request, response);
      if (!streamer) return;
      const preferences = await preferenceStore.find(streamer.twitchUserId);
      if (!preferences) {
        response.status(404).json({
          code: "PREFERENCES_NOT_FOUND",
          message: "Camera preferences have not been saved yet.",
        });
        return;
      }
      response.json(streamerPreferencesSchema.parse(preferences));
    },

    async put(request: Request, response: Response) {
      const streamer = await owner(request, response);
      if (!streamer) return;
      const result = streamerPreferencesSchema.safeParse(request.body);
      if (!result.success) {
        response.status(400).json({
          code: "INVALID_PREFERENCES",
          issues: result.error.issues.map((issue) => ({
            code:
              issue.code === "custom" &&
              typeof issue.params?.issueCode === "string"
                ? issue.params.issueCode
                : "INVALID_FIELD",
            message: issue.message,
            path: issue.path,
          })),
          message: "Camera preferences are invalid.",
        });
        return;
      }
      response.json(
        await preferenceStore.save(streamer.twitchUserId, result.data),
      );
    },
  };
}

import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const streamerIdentitySchema = z.object({
  login: z.string().min(1),
  twitchUserId: z.string().regex(/^\d+$/),
});

export const dashboardSessionResponseSchema = z.object({
  authenticated: z.literal(true),
  streamer: streamerIdentitySchema,
});

export type DashboardSessionResponse = z.infer<
  typeof dashboardSessionResponseSchema
>;

export const apiErrorResponseSchema = z.object({
  code: z.string().min(1),
  issues: z
    .array(
      z.object({
        code: z.string().min(1),
        message: z.string().min(1),
        path: z.array(z.union([z.string(), z.number()])),
      }),
    )
    .optional(),
  message: z.string().min(1),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export const cameraSlotSchema = z.enum([
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
]);

export const cameraPreferenceSchema = z.object({
  active: z.boolean(),
  label: z.string(),
  slot: cameraSlotSchema,
});

export const streamerPreferencesSchema = z
  .object({
    mainSlot: cameraSlotSchema,
    slots: z.array(cameraPreferenceSchema).length(4),
  })
  .superRefine((preferences, context) => {
    const requiredSlots = [
      "topLeft",
      "topRight",
      "bottomLeft",
      "bottomRight",
    ] as const;
    const slotSet = new Set(preferences.slots.map((camera) => camera.slot));
    if (
      slotSet.size !== requiredSlots.length ||
      requiredSlots.some((slot) => !slotSet.has(slot))
    ) {
      context.addIssue({
        code: "custom",
        message: "Include each of the four fixed camera slots once.",
        params: { issueCode: "INVALID_SLOT_SET" },
        path: ["slots"],
      });
    }
    const activeCount = preferences.slots.filter(
      (camera) => camera.active,
    ).length;
    if (activeCount < 2 || activeCount > 4) {
      context.addIssue({
        code: "custom",
        message: "Activate between two and four cameras.",
        params: { issueCode: "INVALID_CAMERA_COUNT" },
        path: ["slots"],
      });
    }
    const mainCamera = preferences.slots.find(
      (camera) => camera.slot === preferences.mainSlot,
    );
    if (!mainCamera?.active) {
      context.addIssue({
        code: "custom",
        message: "Select an active camera as the main camera.",
        params: { issueCode: "INACTIVE_MAIN_CAMERA" },
        path: ["mainSlot"],
      });
    }
    preferences.slots.forEach((camera, index) => {
      if (camera.active && camera.label.trim().length === 0) {
        context.addIssue({
          code: "custom",
          message: "Enter a label for each active camera.",
          params: { issueCode: "EMPTY_CAMERA_LABEL" },
          path: ["slots", index, "label"],
        });
      }
      if (camera.label.length > 40) {
        context.addIssue({
          code: "custom",
          message: "Camera labels must be 40 characters or fewer.",
          params: { issueCode: "CAMERA_LABEL_TOO_LONG" },
          path: ["slots", index, "label"],
        });
      }
    });
  });

export type StreamerPreferences = z.infer<typeof streamerPreferencesSchema>;

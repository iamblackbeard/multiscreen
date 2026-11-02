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

export const publicCameraSchema = z.object({
  label: z.string().min(1).max(40),
  slot: cameraSlotSchema,
});

export const activeMulticamSessionSchema = z.object({
  active: z.literal(true),
  cameras: z.array(publicCameraSchema).min(2).max(4),
  expiresAt: z.iso.datetime(),
  layout: z.literal("2x2"),
  mainSlot: cameraSlotSchema,
  protocolVersion: z.literal(1),
  revision: z.number().int().positive(),
});

export const inactiveMulticamSessionSchema = z.object({
  active: z.literal(false),
});

export const publicMulticamSessionSchema = z.discriminatedUnion("active", [
  activeMulticamSessionSchema,
  inactiveMulticamSessionSchema,
]);

export type ActiveMulticamSession = z.infer<
  typeof activeMulticamSessionSchema
>;
export type PublicMulticamSession = z.infer<
  typeof publicMulticamSessionSchema
>;

export const ownerMulticamStatusSchema = z.discriminatedUnion("active", [
  inactiveMulticamSessionSchema,
  z.object({
    active: z.literal(true),
    hasUnpublishedChanges: z.boolean(),
    live: activeMulticamSessionSchema,
  }),
]);

export type OwnerMulticamStatus = z.infer<typeof ownerMulticamStatusSchema>;

export const popupContextSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("owner"),
    multicam: ownerMulticamStatusSchema,
    preferences: streamerPreferencesSchema,
  }),
  z.object({
    kind: z.literal("viewer"),
    session: activeMulticamSessionSchema,
  }),
  z.object({ kind: z.literal("inactive") }),
]);

export type PopupContext = z.infer<typeof popupContextSchema>;

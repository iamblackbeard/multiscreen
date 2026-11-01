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
  message: z.string().min(1),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

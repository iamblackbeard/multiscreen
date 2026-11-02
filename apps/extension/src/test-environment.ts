import { requiredApiBaseUrl } from "./environment.ts";

export const testApiBaseUrl = requiredApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
);

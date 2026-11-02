export function requiredApiBaseUrl(value: string | undefined) {
  if (!value?.trim()) {
    throw new Error("VITE_API_BASE_URL is required");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("VITE_API_BASE_URL must be a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("VITE_API_BASE_URL must use HTTP or HTTPS");
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("VITE_API_BASE_URL must contain only an HTTP(S) origin");
  }

  return url.origin;
}

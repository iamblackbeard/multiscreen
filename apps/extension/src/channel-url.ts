/**
 * Known Twitch system routes that do not represent channel pages.
 * A URL whose first path segment matches one of these is not a channel page.
 */
const NON_CHANNEL_SEGMENTS = new Set([
  "browse",
  "directory",
  "following",
  "moderator",
  "search",
  "subscriptions",
  "videos",
  "settings",
  "wallet",
  "drops",
  "friends",
  "inventory",
  "payments",
  "prime",
  "store",
  "turbo",
]);

/**
 * Resolve the Twitch channel login from a URL string.
 *
 * Returns the lowercase login when the URL looks like a standard channel page,
 * or `null` when the URL is a clip, VOD, directory, or other non-channel route.
 */
export function resolveChannelLogin(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  // Strip leading slash and split into segments, ignoring trailing empty parts.
  const segments = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);

  // No segment → homepage
  if (segments.length === 0) return null;

  const first = segments[0]!.toLowerCase();

  // Known non-channel routes
  if (NON_CHANNEL_SEGMENTS.has(first)) return null;

  // Clip URLs: /:login/clip/:clipId
  if (segments.length >= 2 && segments[1]!.toLowerCase() === "clip")
    return null;

  return first;
}

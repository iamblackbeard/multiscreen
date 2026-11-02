import {
  popupContextSchema,
  streamerPreferencesSchema,
  type PopupContext,
  type StreamerPreferences,
} from "@multicam/contracts";

import {
  signInWithTwitch,
  type BrowserIdentity,
  type ExtensionCredentials,
} from "./extension-auth.ts";

export type PopupMessage =
  | { type: "disable" }
  | { type: "enable" }
  | { channel: string | null; type: "loadContext" }
  | { type: "publish" }
  | { preferences: StreamerPreferences; type: "savePreferences" }
  | { type: "signIn" };

export interface PopupStorage {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  remove(key: string): Promise<void>;
  set(items: Record<string, unknown>): Promise<void>;
}

function storedCredentials(value: unknown): ExtensionCredentials {
  if (
    typeof value !== "object" ||
    value === null ||
    !("accessToken" in value) ||
    typeof value.accessToken !== "string" ||
    !("refreshToken" in value) ||
    typeof value.refreshToken !== "string" ||
    !("expiresIn" in value) ||
    typeof value.expiresIn !== "number"
  ) {
    throw new Error("Sign in with Twitch to save preferences.");
  }
  return {
    accessToken: value.accessToken,
    expiresIn: value.expiresIn,
    refreshToken: value.refreshToken,
  };
}

export function createPopupMessageHandler({
  apiBaseUrl,
  fetchFromApi = fetch,
  identity,
  storage,
}: {
  apiBaseUrl: string;
  fetchFromApi?: typeof fetch;
  identity?: BrowserIdentity;
  storage: PopupStorage;
}) {
  const credentials = async () => {
    const stored = await storage.get("extensionCredentials");
    return storedCredentials(stored.extensionCredentials);
  };

  const refresh = async (current: ExtensionCredentials) => {
    const response = await fetchFromApi(
      new URL("/api/extension-auth/refresh", apiBaseUrl).toString(),
      {
        body: JSON.stringify({ refreshToken: current.refreshToken }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    if (!response.ok) {
      await storage.remove("extensionCredentials");
      throw new Error("The extension session has expired.");
    }
    const next = storedCredentials(await response.json());
    await storage.set({ extensionCredentials: next });
    return next;
  };

  const authorizedFetch = async (path: string, init?: RequestInit) => {
    let current = await credentials();
    const request = () =>
      fetchFromApi(new URL(path, apiBaseUrl).toString(), {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers).entries()),
          Authorization: `Bearer ${current.accessToken}`,
        },
      });
    let response = await request();
    if (response.status === 401) {
      current = await refresh(current);
      response = await request();
    }
    return response;
  };

  const savePreferences = async (input: StreamerPreferences) => {
    const preferences = streamerPreferencesSchema.parse(input);
    await storage.set({ pendingPreferences: preferences });
    const response = await authorizedFetch("/api/preferences", {
      body: JSON.stringify(preferences),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PUT",
    });
    if (!response.ok) throw new Error("Camera preferences could not be saved.");
    const saved = streamerPreferencesSchema.parse(await response.json());
    await storage.remove("pendingPreferences");
    return saved;
  };

  return async (message: PopupMessage): Promise<unknown> => {
    if (message.type === "savePreferences") {
      return savePreferences(message.preferences);
    }
    if (message.type === "signIn") {
      if (!identity) throw new Error("Browser Identity is unavailable.");
      const signedIn = await signInWithTwitch({
        apiBaseUrl,
        fetchFromApi,
        identity,
      });
      await storage.set({ extensionCredentials: signedIn });
      return undefined;
    }
    if (message.type === "loadContext") {
      if (!message.channel) return { kind: "inactive" } satisfies PopupContext;
      try {
        const pending = await storage.get("pendingPreferences");
        if (pending.pendingPreferences) {
          await savePreferences(
            streamerPreferencesSchema.parse(pending.pendingPreferences),
          );
        }
        const response = await authorizedFetch(
          `/api/popup-context?channel=${encodeURIComponent(message.channel)}`,
        );
        if (response.status === 401) return { kind: "anonymous" };
        if (!response.ok) throw new Error("Popup context request failed.");
        return popupContextSchema.parse(await response.json());
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes("Sign in") ||
            error.message.includes("expired"))
        ) {
          return { kind: "anonymous" };
        }
        throw error;
      }
    }

    const operations = {
      disable: { method: "DELETE", path: "/api/multicam" },
      enable: { method: "POST", path: "/api/multicam/enable" },
      publish: { method: "POST", path: "/api/multicam/publish" },
    } as const;
    const operation = operations[message.type];
    const response = await authorizedFetch(operation.path, {
      method: operation.method,
    });
    if (!response.ok) throw new Error("Multicam control failed.");
    return response.json();
  };
}

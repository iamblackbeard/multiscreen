import { describe, expect, it, vi } from "vitest";

import { createPopupMessageHandler } from "./popup-background.ts";

const preferences = {
  mainSlot: "topLeft" as const,
  slots: [
    { active: true, label: "Presenter", slot: "topLeft" as const },
    { active: true, label: "Guest", slot: "topRight" as const },
    { active: false, label: "", slot: "bottomLeft" as const },
    { active: false, label: "", slot: "bottomRight" as const },
  ],
};

describe("popup background persistence", () => {
  it("records an edit before awaiting backend persistence", async () => {
    let completeRequest!: (response: Response) => void;
    const fetchFromApi = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          completeRequest = resolve;
        }),
    );
    const storage = {
      get: vi.fn(async () => ({
        extensionCredentials: {
          accessToken: "application-access",
          expiresIn: 900,
          refreshToken: "application-refresh",
        },
      })),
      remove: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
    };
    const handleMessage = createPopupMessageHandler({
      apiBaseUrl: "https://api.multicam.test",
      fetchFromApi,
      storage,
    });

    const saving = handleMessage({ type: "savePreferences", preferences });
    await vi.waitFor(() => {
      expect(storage.set).toHaveBeenCalledWith({
        pendingPreferences: preferences,
      });
      expect(fetchFromApi).toHaveBeenCalledOnce();
    });
    expect(storage.remove).not.toHaveBeenCalled();

    completeRequest(new Response(JSON.stringify(preferences), { status: 200 }));
    await expect(saving).resolves.toEqual(preferences);
    expect(storage.remove).toHaveBeenCalledWith("pendingPreferences");
  });
});

import {
  apiErrorResponseSchema,
  dashboardSessionResponseSchema,
  healthResponseSchema,
  streamerPreferencesSchema,
  type ApiErrorResponse,
  type DashboardSessionResponse,
  type StreamerPreferences,
} from "@multicam/contracts";
import { useEffect, useState } from "react";

type ApiStatus = "checking" | "connected" | "unavailable";
type AuthStatus = "checking" | "anonymous" | "authenticated" | "unavailable";
type FieldIssue = NonNullable<ApiErrorResponse["issues"]>[number];

const newStreamerPreferences = {
  mainSlot: "topLeft",
  slots: [
    { active: true, label: "Camera 1", slot: "topLeft" },
    { active: true, label: "Camera 2", slot: "topRight" },
    { active: false, label: "", slot: "bottomLeft" },
    { active: false, label: "", slot: "bottomRight" },
  ],
} satisfies StreamerPreferences;

export function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [streamer, setStreamer] =
    useState<DashboardSessionResponse["streamer"]>();
  const [preferences, setPreferences] = useState<StreamerPreferences>();
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [fieldIssues, setFieldIssues] = useState<FieldIssue[]>([]);

  const updateCamera = (
    slot: StreamerPreferences["slots"][number]["slot"],
    update: Partial<StreamerPreferences["slots"][number]>,
  ) => {
    setPreferences((current) =>
      current
        ? {
            ...current,
            slots: current.slots.map((camera) =>
              camera.slot === slot ? { ...camera, ...update } : camera,
            ),
          }
        : current,
    );
    setSaveStatus("idle");
    setFieldIssues([]);
  };

  const savePreferences = async () => {
    if (!preferences) return;
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/preferences", {
        body: JSON.stringify(preferences),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      if (!response.ok) {
        const error = apiErrorResponseSchema.parse(await response.json());
        setFieldIssues(error.issues ?? []);
        setSaveStatus("error");
        return;
      }
      setPreferences(
        streamerPreferencesSchema.parse(await response.json()),
      );
      setSaveStatus("saved");
      setFieldIssues([]);
    } catch {
      setSaveStatus("error");
    }
  };

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch("/health");
        if (!response.ok) throw new Error("Health request failed");
        healthResponseSchema.parse(await response.json());
        setApiStatus("connected");
      } catch {
        setApiStatus("unavailable");
      }
    };

    void checkHealth();
  }, []);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/session");
        if (response.status === 401) {
          setAuthStatus("anonymous");
          return;
        }
        if (!response.ok) throw new Error("Session request failed");
        const payload = dashboardSessionResponseSchema.parse(
          await response.json(),
        );
        setStreamer(payload.streamer);
        setAuthStatus("authenticated");
        try {
          const preferencesResponse = await fetch("/api/preferences");
          if (preferencesResponse.ok) {
            setPreferences(
              streamerPreferencesSchema.parse(
                await preferencesResponse.json(),
              ),
            );
          } else if (preferencesResponse.status === 404) {
            setPreferences(newStreamerPreferences);
          }
        } catch {
          // Authentication remains usable if preferences cannot be loaded.
        }
      } catch {
        setAuthStatus("unavailable");
      }
    };

    void loadSession();
  }, []);

  const statusText = {
    checking: "Checking API…",
    connected: "API connected",
    unavailable: "API unavailable",
  }[apiStatus];

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <section className="mx-auto max-w-3xl rounded-3xl border border-violet-400/20 bg-slate-900 p-10 shadow-2xl shadow-violet-950/40">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-violet-400">
          Streamer dashboard
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Twitch Multicam</h1>
        <p className="mt-4 max-w-xl text-lg text-slate-300">
          Camera setup and live-session controls are coming next.
        </p>
        {authStatus === "anonymous" && (
          <a
            className="mt-8 inline-flex rounded-lg bg-violet-500 px-5 py-3 font-semibold text-white hover:bg-violet-400"
            href="/auth/twitch"
          >
            Sign in with Twitch
          </a>
        )}
        {authStatus === "authenticated" && streamer && (
          <>
            <p>Signed in as {streamer.login}</p>
            {preferences && (
              <form
                className="mt-8 grid grid-cols-2 gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void savePreferences();
                }}
              >
                {fieldIssues
                  .filter(
                    (issue) =>
                      !(
                        issue.path[0] === "slots" &&
                        typeof issue.path[1] === "number"
                      ),
                  )
                  .map((issue) => (
                    <p
                      className="col-span-2 rounded-lg bg-rose-950/60 px-4 py-3 text-sm text-rose-200"
                      key={`${issue.code}-${issue.path.join(".")}`}
                    >
                      {issue.message}
                    </p>
                  ))}
                {preferences.slots.map((camera, index) => {
                  const slotName = {
                    bottomLeft: "Bottom left",
                    bottomRight: "Bottom right",
                    topLeft: "Top left",
                    topRight: "Top right",
                  }[camera.slot];
                  return (
                    <fieldset
                      className="rounded-2xl border border-slate-700 bg-slate-950 p-5"
                      key={camera.slot}
                    >
                      <legend className="px-2 font-semibold">
                        {slotName} camera
                      </legend>
                      <label className="flex items-center gap-2">
                        <input
                          checked={camera.active}
                          onChange={(event) =>
                            updateCamera(camera.slot, {
                              active: event.target.checked,
                            })
                          }
                          type="checkbox"
                        />
                        Active
                      </label>
                      <label className="mt-4 block">
                        <span className="block text-sm text-slate-300">
                          Camera label
                        </span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2"
                          onChange={(event) =>
                            updateCamera(camera.slot, {
                              label: event.target.value,
                            })
                          }
                          type="text"
                          value={camera.label}
                        />
                      </label>
                      <label className="mt-4 flex items-center gap-2">
                        <input
                          checked={preferences.mainSlot === camera.slot}
                          disabled={!camera.active}
                          name="main-camera"
                          onChange={() => {
                            setPreferences((current) =>
                              current
                                ? { ...current, mainSlot: camera.slot }
                                : current,
                            );
                            setSaveStatus("idle");
                            setFieldIssues([]);
                          }}
                          type="radio"
                        />
                        Main camera
                      </label>
                      {fieldIssues
                        .filter(
                          (issue) =>
                            issue.path[0] === "slots" &&
                            issue.path[1] === index,
                        )
                        .map((issue) => (
                          <p
                            className="mt-2 text-sm text-rose-300"
                            key={`${issue.code}-${issue.path.join(".")}`}
                          >
                            {issue.message}
                          </p>
                        ))}
                    </fieldset>
                  );
                })}
                <div className="col-span-2 flex items-center gap-4">
                  <button
                    className="rounded-lg bg-violet-500 px-5 py-3 font-semibold text-white hover:bg-violet-400 disabled:opacity-60"
                    disabled={saveStatus === "saving"}
                    type="submit"
                  >
                    {saveStatus === "saving"
                      ? "Saving…"
                      : "Save preferences"}
                  </button>
                  {saveStatus === "saved" && <p>Preferences saved.</p>}
                  {saveStatus === "error" && (
                    <p>Preferences could not be saved.</p>
                  )}
                </div>
              </form>
            )}
          </>
        )}
        <p
          className="mt-8 inline-flex rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-200"
          role="status"
        >
          <span aria-hidden="true" className="mr-2 text-emerald-400">
            ●
          </span>
          {statusText}
        </p>
      </section>
    </main>
  );
}

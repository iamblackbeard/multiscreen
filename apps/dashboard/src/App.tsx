import {
  apiErrorResponseSchema,
  activeMulticamSessionSchema,
  dashboardSessionResponseSchema,
  healthResponseSchema,
  ownerMulticamStatusSchema,
  streamerPreferencesSchema,
  type ApiErrorResponse,
  type DashboardSessionResponse,
  type OwnerMulticamStatus,
  type StreamerPreferences,
} from "@multicam/contracts";
import { useEffect, useRef, useState } from "react";

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
  const [multicamStatus, setMulticamStatus] =
    useState<OwnerMulticamStatus>();
  const lastSavedPreferences = useRef<string | undefined>(undefined);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [fieldIssues, setFieldIssues] = useState<FieldIssue[]>([]);
  const [sessionActionError, setSessionActionError] =
    useState<ApiErrorResponse>();
  const [sessionStatusError, setSessionStatusError] = useState(false);

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

  const savePreferences = async (
    nextPreferences = preferences,
  ) => {
    if (!nextPreferences) return;
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/preferences", {
        body: JSON.stringify(nextPreferences),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      if (!response.ok) {
        const error = apiErrorResponseSchema.parse(await response.json());
        setFieldIssues(error.issues ?? []);
        setSaveStatus("error");
        return;
      }
      const saved = streamerPreferencesSchema.parse(await response.json());
      lastSavedPreferences.current = JSON.stringify(saved);
      setPreferences(saved);
      setSaveStatus("saved");
      setFieldIssues([]);
      try {
        const multicamResponse = await fetch("/api/multicam");
        if (multicamResponse.ok) {
          setMulticamStatus(
            ownerMulticamStatusSchema.parse(await multicamResponse.json()),
          );
        }
      } catch {
        // Saving the draft succeeded even if live status cannot be refreshed.
      }
    } catch {
      setSaveStatus("error");
    }
  };

  useEffect(() => {
    if (!preferences) return;
    const serialized = JSON.stringify(preferences);
    if (serialized === lastSavedPreferences.current) return;
    const timer = window.setTimeout(() => {
      void savePreferences(preferences);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [preferences]);

  const publishPreferences = async () => {
    const response = await fetch("/api/multicam/publish", { method: "POST" });
    if (!response.ok) return;
    const live = activeMulticamSessionSchema.parse(await response.json());
    setMulticamStatus({
      active: true,
      hasUnpublishedChanges: false,
      live,
    });
  };

  const disableMulticam = async () => {
    const response = await fetch("/api/multicam", { method: "DELETE" });
    if (!response.ok) return;
    setMulticamStatus(
      ownerMulticamStatusSchema.parse(await response.json()),
    );
  };

  const enableMulticam = async () => {
    setSessionActionError(undefined);
    const response = await fetch("/api/multicam/enable", { method: "POST" });
    if (!response.ok) {
      setSessionActionError(apiErrorResponseSchema.parse(await response.json()));
      return;
    }
    const live = activeMulticamSessionSchema.parse(await response.json());
    setMulticamStatus({
      active: true,
      hasUnpublishedChanges: false,
      live,
    });
  };

  const loadMulticamStatus = async () => {
    try {
      const response = await fetch("/api/multicam");
      if (!response.ok) throw new Error("Session status request failed");
      setMulticamStatus(
        ownerMulticamStatusSchema.parse(await response.json()),
      );
      setSessionStatusError(false);
    } catch {
      setSessionStatusError(true);
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
            const savedPreferences = streamerPreferencesSchema.parse(
              await preferencesResponse.json(),
            );
            lastSavedPreferences.current = JSON.stringify(savedPreferences);
            setPreferences(savedPreferences);
          } else if (preferencesResponse.status === 404) {
            setPreferences(newStreamerPreferences);
          }
          await loadMulticamStatus();
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
  const multicamExpired =
    multicamStatus?.active === true &&
    Date.parse(multicamStatus.live.expiresAt) <= Date.now();

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <section className="mx-auto max-w-3xl rounded-3xl border border-violet-400/20 bg-slate-900 p-10 shadow-2xl shadow-violet-950/40">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-violet-400">
          Streamer dashboard
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Twitch Multicam</h1>
        <p className="mt-4 max-w-xl text-lg text-slate-300">
          Set up the composite viewers will use, then publish it for the
          current broadcast.
        </p>
        <section
          aria-labelledby="obs-setup-heading"
          className="mt-8 rounded-2xl border border-slate-700 bg-slate-950 p-6"
        >
          <h2 className="text-2xl font-semibold" id="obs-setup-heading">
            Build one 2×2 OBS scene
          </h2>
          <p className="mt-3 text-slate-300">
            Place two to four unique camera feeds into fixed, equal quadrants.
            Never duplicate a feed to fill the grid: design unused quadrants
            with branding, schedules, or instructions instead.
          </p>
          <p className="mt-3 text-slate-300">
            Top-left is a helpful default for your main camera, but any active
            quadrant can be main.
          </p>
          <p className="mt-3 text-slate-300">
            A 1080p composite gives each quadrant about 540p; a 1440p
            composite gives each about 720p. Cropping cannot restore pixels
            that were not delivered, and Multicam does not promise 4K
            delivery.
          </p>
        </section>
        {authStatus === "anonymous" && (
          <a
            className="mt-8 inline-flex rounded-lg bg-violet-500 px-5 py-3 font-semibold text-white hover:bg-violet-400"
            href="/auth/twitch"
          >
            Sign in with Twitch
          </a>
        )}
        {authStatus === "unavailable" && (
          <section className="mt-8 rounded-2xl border border-rose-400/40 bg-rose-950/30 p-5">
            <h2 className="text-xl font-semibold text-rose-100">
              Twitch sign-in needs attention
            </h2>
            <p className="mt-2 text-rose-100/80">
              If Twitch login keeps failing, allow cookies for this dashboard
              and confirm Twitch is reachable before trying again.
            </p>
            <a
              className="mt-4 inline-flex rounded-lg bg-violet-500 px-4 py-2 font-semibold text-white hover:bg-violet-400"
              href="/auth/twitch"
            >
              Try Twitch sign-in again
            </a>
          </section>
        )}
        {authStatus === "authenticated" && streamer && (
          <>
            <p>Signed in as {streamer.login}</p>
            {sessionStatusError && (
              <section className="mt-8 rounded-2xl border border-rose-400/40 bg-rose-950/30 p-5">
                <h2 className="text-xl font-semibold text-rose-100">
                  Live session status unavailable
                </h2>
                <p className="mt-2 text-rose-100/80">
                  Your saved camera setup is safe. Check the API connection,
                  then retry the live-session status request.
                </p>
                <button
                  className="mt-4 rounded-lg border border-rose-300 px-4 py-2 font-semibold text-rose-100"
                  onClick={() => void loadMulticamStatus()}
                  type="button"
                >
                  Retry session status
                </button>
              </section>
            )}
            {multicamStatus?.active && !multicamExpired && (
              <section className="mt-8 rounded-2xl border border-violet-400/30 bg-slate-950 p-5">
                <h2 className="text-xl font-semibold">Live configuration</h2>
                <p>Live revision {multicamStatus.live.revision}</p>
                <p>
                  {multicamStatus.hasUnpublishedChanges
                    ? "Unpublished preference changes"
                    : "No unpublished changes"}
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    className="rounded-lg bg-violet-500 px-4 py-2 font-semibold disabled:opacity-50"
                    disabled={!multicamStatus.hasUnpublishedChanges}
                    onClick={() => void publishPreferences()}
                    type="button"
                  >
                    Update Live Configuration
                  </button>
                  <button
                    className="rounded-lg border border-rose-400 px-4 py-2 font-semibold text-rose-200"
                    onClick={() => void disableMulticam()}
                    type="button"
                  >
                    Disable Multicam
                  </button>
                </div>
              </section>
            )}
            {multicamStatus?.active && multicamExpired && (
              <section className="mt-8 rounded-2xl border border-amber-400/40 bg-amber-950/30 p-5">
                <h2 className="text-xl font-semibold text-amber-100">
                  Multicam session expired
                </h2>
                <p className="mt-2 text-amber-100/80">
                  The 24-hour safety window ended. If this broadcast is still
                  live, enable Multicam again to publish a fresh session.
                </p>
                <button
                  className="mt-4 rounded-lg bg-amber-400 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-300"
                  onClick={() => void enableMulticam()}
                  type="button"
                >
                  Re-enable Multicam
                </button>
              </section>
            )}
            {multicamStatus && !multicamStatus.active && (
              <section className="mt-8 rounded-2xl border border-slate-700 bg-slate-950 p-5">
                <h2 className="text-xl font-semibold">
                  {sessionActionError?.message ?? "Multicam is inactive"}
                </h2>
                <p className="mt-2 text-slate-300">
                  {sessionActionError?.code === "TWITCH_STREAM_OFFLINE"
                    ? "Go live on Twitch, then retry activation from this dashboard."
                    : "Your saved setup is private until you enable it for the current Twitch broadcast."}
                </p>
                <button
                  className="mt-4 rounded-lg bg-violet-500 px-4 py-2 font-semibold text-white hover:bg-violet-400"
                  onClick={() => void enableMulticam()}
                  type="button"
                >
                  {sessionActionError ? "Retry activation" : "Enable Multicam"}
                </button>
              </section>
            )}
            {preferences && (
              <>
                <section
                  aria-labelledby="configuration-preview-heading"
                  className="mt-8"
                >
                  <h2
                    className="text-2xl font-semibold"
                    id="configuration-preview-heading"
                  >
                    Saved configuration preview
                  </h2>
                  <div className="mt-4 grid aspect-video grid-cols-2 overflow-hidden rounded-2xl border border-slate-600 bg-slate-950">
                    {preferences.slots.map((camera) => (
                      <div
                        className={`flex min-h-32 flex-col items-center justify-center border border-slate-800 p-4 text-center ${camera.active ? "bg-violet-950/40" : "bg-slate-900"}`}
                        key={`preview-${camera.slot}`}
                      >
                        {camera.active ? (
                          <>
                            <p className="text-lg font-semibold">
                              {camera.label}
                            </p>
                            {camera.slot === preferences.mainSlot && (
                              <p className="mt-2 rounded-full bg-violet-500/20 px-3 py-1 text-sm text-violet-200">
                                {camera.label} · Main camera
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-slate-400">Unused quadrant</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
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
              </>
            )}
          </>
        )}
        <section
          aria-labelledby="troubleshooting-heading"
          className="mt-10 rounded-2xl border border-slate-700 bg-slate-950 p-6"
        >
          <h2 className="text-2xl font-semibold" id="troubleshooting-heading">
            Troubleshooting
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <article>
              <h3 className="font-semibold text-violet-200">
                Twitch login fails
              </h3>
              <p className="mt-1 text-sm text-slate-300">
                Allow dashboard cookies, confirm Twitch is reachable, and
                start sign-in again.
              </p>
            </article>
            <article>
              <h3 className="font-semibold text-violet-200">
                Activation says offline
              </h3>
              <p className="mt-1 text-sm text-slate-300">
                Start the Twitch broadcast, wait for it to show as live, then
                retry activation.
              </p>
            </article>
            <article>
              <h3 className="font-semibold text-violet-200">
                Session expired
              </h3>
              <p className="mt-1 text-sm text-slate-300">
                Confirm the stream is still live and re-enable Multicam to
                begin a fresh 24-hour session.
              </p>
            </article>
            <article>
              <h3 className="font-semibold text-violet-200">
                Viewers see the wrong session
              </h3>
              <p className="mt-1 text-sm text-slate-300">
                Confirm viewers opened the same channel and current broadcast.
                If public status still differs from this dashboard, disable
                Multicam and enable it again.
              </p>
            </article>
          </div>
        </section>
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

import {
  streamerPreferencesSchema,
  type PopupContext,
  type StreamerPreferences,
} from "@multicam/contracts";
import { useEffect, useState } from "react";

type PopupState = PopupContext | { kind: "anonymous" };

export interface PopupClient {
  disable(): Promise<unknown>;
  enable(): Promise<unknown>;
  loadContext(): Promise<PopupState>;
  publish(): Promise<unknown>;
  savePreferences(
    preferences: StreamerPreferences,
  ): Promise<StreamerPreferences>;
  signIn(): Promise<unknown>;
}

const slotNames = {
  bottomLeft: "Bottom left",
  bottomRight: "Bottom right",
  topLeft: "Top left",
  topRight: "Top right",
} as const;

export function App({
  client,
  dashboardUrl = "https://dashboard.multicam.test/",
}: {
  client: PopupClient;
  dashboardUrl?: string;
}) {
  const [state, setState] = useState<PopupState>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setState(await client.loadContext());
      setError(undefined);
    } catch {
      setError("Multicam is temporarily unavailable.");
    }
  };

  useEffect(() => {
    void load();
  }, [client]);

  const saveOwnerPreferences = (
    preferences: StreamerPreferences,
  ) => {
    setState((current) =>
      current?.kind === "owner" ? { ...current, preferences } : current,
    );
    if (!streamerPreferencesSchema.safeParse(preferences).success) return;
    setSaving(true);
    void client
      .savePreferences(preferences)
      .then(() => setError(undefined))
      .catch(() => setError("Camera settings could not be saved."))
      .finally(() => setSaving(false));
  };

  const runControl = async (control: () => Promise<unknown>) => {
    try {
      await control();
      await load();
    } catch {
      setError("The Multicam control could not be completed.");
    }
  };

  return (
    <main className="w-96 bg-slate-950 p-5 text-slate-100">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
        Extension popup
      </p>
      <h1 className="mt-2 text-2xl font-bold">Twitch Multicam</h1>
      {!state && !error && <p className="mt-4">Checking this channel…</p>}
      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

      {state?.kind === "anonymous" && (
        <button
          className="mt-5 w-full rounded-lg bg-violet-500 px-4 py-2 font-semibold"
          onClick={() => void runControl(client.signIn)}
          type="button"
        >
          Sign in with Twitch
        </button>
      )}

      {state?.kind === "owner" && (
        <section className="mt-5" aria-labelledby="camera-settings-heading">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold" id="camera-settings-heading">
              Camera settings
            </h2>
            <span className="text-xs text-slate-400">
              {saving ? "Saving…" : "Saved automatically"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {state.preferences.slots.map((camera) => (
              <fieldset
                className="rounded-lg border border-slate-700 p-3"
                key={camera.slot}
              >
                <legend className="px-1 text-xs font-semibold text-slate-300">
                  {slotNames[camera.slot]}
                </legend>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    checked={camera.active}
                    onChange={(event) =>
                      saveOwnerPreferences({
                        ...state.preferences,
                        slots: state.preferences.slots.map((slot) =>
                          slot.slot === camera.slot
                            ? { ...slot, active: event.target.checked }
                            : slot,
                        ),
                      })
                    }
                    type="checkbox"
                  />
                  Active
                </label>
                <label className="mt-2 block text-xs">
                  <span className="sr-only">
                    {slotNames[camera.slot]} camera label
                  </span>
                  <input
                    aria-label={`${slotNames[camera.slot]} camera label`}
                    className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1"
                    maxLength={40}
                    onChange={(event) =>
                      saveOwnerPreferences({
                        ...state.preferences,
                        slots: state.preferences.slots.map((slot) =>
                          slot.slot === camera.slot
                            ? { ...slot, label: event.target.value }
                            : slot,
                        ),
                      })
                    }
                    value={camera.label}
                  />
                </label>
                <label className="mt-2 flex items-center gap-2 text-xs">
                  <input
                    checked={state.preferences.mainSlot === camera.slot}
                    disabled={!camera.active}
                    name="main-camera"
                    onChange={() =>
                      saveOwnerPreferences({
                        ...state.preferences,
                        mainSlot: camera.slot,
                      })
                    }
                    type="radio"
                  />
                  Main
                </label>
              </fieldset>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            {!state.multicam.active ? (
              <button
                className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold"
                onClick={() => void runControl(client.enable)}
                type="button"
              >
                Enable Multicam
              </button>
            ) : (
              <>
                <button
                  className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  disabled={!state.multicam.hasUnpublishedChanges}
                  onClick={() => void runControl(client.publish)}
                  type="button"
                >
                  Update Live Configuration
                </button>
                <button
                  className="rounded-lg border border-rose-400 px-3 py-2 text-sm font-semibold text-rose-200"
                  onClick={() => void runControl(client.disable)}
                  type="button"
                >
                  Disable Multicam
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {state?.kind === "viewer" && (
        <section className="mt-5">
          <h2 className="font-semibold">Multicam is active</h2>
          <p className="mt-1 text-sm text-slate-300">
            Choose from {state.session.cameras.length} camera angles in the
            Twitch player.
          </p>
          <ul className="mt-3 text-sm">
            {state.session.cameras.map((camera) => (
              <li key={camera.slot}>{camera.label}</li>
            ))}
          </ul>
        </section>
      )}

      {state?.kind === "inactive" && (
        <p className="mt-5 text-sm text-slate-300">
          Multicam is not active on this channel.
        </p>
      )}

      <a
        className="mt-5 block text-sm font-semibold text-violet-300 underline"
        href={dashboardUrl}
        rel="noreferrer"
        target="_blank"
      >
        Open full dashboard
      </a>
    </main>
  );
}

import {
  dashboardSessionResponseSchema,
  healthResponseSchema,
  type DashboardSessionResponse,
} from "@multicam/contracts";
import { useEffect, useState } from "react";

type ApiStatus = "checking" | "connected" | "unavailable";
type AuthStatus = "checking" | "anonymous" | "authenticated" | "unavailable";

export function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [streamer, setStreamer] =
    useState<DashboardSessionResponse["streamer"]>();

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
          <p>Signed in as {streamer.login}</p>
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

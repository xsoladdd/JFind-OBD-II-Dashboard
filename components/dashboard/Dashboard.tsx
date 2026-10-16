"use client";

import Link from "next/link";
import { useState } from "react";
import { usePolling } from "@/lib/polling";
import { useConnection } from "@/lib/store/connection";
import { useLive } from "@/lib/store/live";
import { useRedline, useTheme, useUnits, type ThemeId } from "@/lib/store/settings";
import { useMounted } from "../connect/hooks";
import { Classic } from "./themes/Classic";
import { Engineer } from "./themes/Engineer";
import { Hud } from "./themes/Hud";
import { Minimal } from "./themes/Minimal";
import { Sport } from "./themes/Sport";
import { useWakeLock } from "./useWakeLock";

const THEMES: { id: ThemeId; label: string; view: () => React.ReactNode }[] = [
  { id: "classic", label: "Classic", view: Classic },
  { id: "sport", label: "Sport", view: Sport },
  { id: "minimal", label: "Minimal", view: Minimal },
  { id: "engineer", label: "Engineer", view: Engineer },
  { id: "hud", label: "HUD", view: Hud },
];

function NotConnected() {
  const status = useConnection((s) => s.status);
  const connect = useConnection((s) => s.connect);
  const busy = status === "connecting" || status === "reconnecting";
  return (
    <section className="mx-auto mt-10 max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center">
      <h2 className="text-lg font-semibold">{busy ? "Connecting…" : "No live data"}</h2>
      <p className="mt-2 text-sm text-zinc-400">Connect to the adapter, or try the dashboard with the built-in simulator.</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/" className="rounded-md bg-sky-600 px-5 py-3 font-semibold hover:bg-sky-500">
          Connect
        </Link>
        <button onClick={() => void connect("demo")} disabled={busy} className="rounded-md border border-zinc-600 px-5 py-3 font-semibold hover:bg-zinc-800 disabled:opacity-40">
          Start demo
        </button>
      </div>
    </section>
  );
}

export function Dashboard() {
  usePolling();
  const wake = useWakeLock();
  const mounted = useMounted();
  const status = useConnection((s) => s.status);
  const hz = useLive((s) => s.hz);
  const [theme, setTheme] = useTheme();
  const [units, setUnits] = useUnits();
  const [redlineRpm, setRedline] = useRedline();
  const [draft, setDraft] = useState<string | null>(null);
  const View = THEMES.find((t) => t.id === theme)?.view ?? Classic;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-x-auto rounded-lg border border-zinc-800 p-0.5" role="tablist" aria-label="Dashboard theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={theme === t.id}
              onClick={() => setTheme(t.id)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium ${theme === t.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setUnits(units === "metric" ? "imperial" : "metric")}
          className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
          aria-label={`Units: ${units}. Switch`}
        >
          {units === "metric" ? "km/h · °C" : "mph · °F"}
        </button>
        <label className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400" title="Your car's redline. Drives the red zone and shift lights.">
          Redline
          <input
            type="number"
            inputMode="numeric"
            min={1000}
            max={12000}
            step={100}
            value={draft ?? redlineRpm}
            onChange={(e) => {
              setDraft(e.currentTarget.value); // let partial input like "6" through while typing
              const v = e.currentTarget.valueAsNumber;
              if (v >= 1000 && v <= 12000) setRedline(v);
            }}
            onBlur={() => setDraft(null)}
            className="w-16 bg-transparent font-mono text-zinc-100 outline-none"
          />
        </label>
        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
          {wake && <span title="Screen Wake Lock active">☀ screen on</span>}
          <span className="font-mono tabular-nums" title="Completed PID reads per second">
            {hz.toFixed(1)} Hz
          </span>
        </div>
      </div>
      {mounted && status === "connected" ? <View /> : <NotConnected />}
    </main>
  );
}

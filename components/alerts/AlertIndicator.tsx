"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ALERT_PREFIX, describeRule, stopAlertEngine, syncAlertEngine } from "@/lib/alerts/engine";
import { armAudio } from "@/lib/alerts/sound";
import { MUTE_MINUTES, useAlerts } from "@/lib/store/alerts";
import { useConnection } from "@/lib/store/connection";
import { dismissToast, useToasts } from "@/lib/store/toasts";
import { useAlertRules } from "@/lib/store/settings";

/** Mounted once in the shell: runs the alert engine on every page, and shows firing alerts with ack / mute. */
export function AlertIndicator() {
  const [rules] = useAlertRules();
  const connected = useConnection((s) => s.status === "connected");
  const show = useAlerts((s) => s.active.length > 0 || s.mutedUntil > 0);

  useEffect(() => syncAlertEngine(rules, connected), [rules, connected]);
  useEffect(() => stopAlertEngine, []);
  useEffect(() => {
    // Browsers keep audio locked until a user gesture: arm it on any tap or key (the Connect tap included).
    const arm = () => armAudio();
    window.addEventListener("pointerdown", arm, true);
    window.addEventListener("keydown", arm, true);
    return () => {
      window.removeEventListener("pointerdown", arm, true);
      window.removeEventListener("keydown", arm, true);
    };
  }, []);

  return show ? <Chip /> : null; // remounts closed each time it reappears
}

function Chip() {
  const active = useAlerts((s) => s.active);
  const muted = useAlerts((s) => s.mutedUntil > 0);
  const { ackAll, mute, unmute } = useAlerts.getState();
  const [open, setOpen] = useState(false);
  const fresh = active.some((a) => !a.acked);
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => {
          // The popover lists the same alerts; drop their toasts so they don't cover it on a phone.
          if (!open) useToasts.getState().toasts.forEach((t) => t.text.startsWith(ALERT_PREFIX) && dismissToast(t.id));
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-label={active.length ? `${active.length} alert${active.length > 1 ? "s" : ""} active` : "Alerts muted"}
        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${fresh ? "animate-pulse bg-red-600 text-white" : active.length ? "bg-red-950 text-red-200" : "bg-zinc-800 text-zinc-300"}`}
      >
        {active.length ? `⚠ ${active.length}` : ""}
        {muted && (active.length ? " 🔕" : "🔕 muted")}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Active alerts"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className="absolute right-0 top-9 z-50 w-72 space-y-3 rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm shadow-xl"
        >
          {active.length ? (
            <ul className="space-y-1">
              {active.map((a) => (
                <li key={a.rule.id} className={a.acked ? "text-zinc-400" : "font-semibold text-red-200"}>
                  {describeRule(a.rule)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-zinc-400">No alert is firing.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {fresh && (
              <button onClick={ackAll} className="rounded-md bg-sky-600 px-3 py-1.5 font-semibold hover:bg-sky-500">
                Acknowledge
              </button>
            )}
            {muted ? (
              <button onClick={unmute} className="rounded-md border border-zinc-600 px-3 py-1.5 hover:bg-zinc-800">
                Unmute
              </button>
            ) : (
              MUTE_MINUTES.map((m) => (
                <button key={m} onClick={() => mute(m)} className="rounded-md border border-zinc-600 px-3 py-1.5 hover:bg-zinc-800">
                  Mute {m} min
                </button>
              ))
            )}
          </div>
          <Link href="/alerts" onClick={() => setOpen(false)} className="block text-xs text-sky-300 underline">
            Manage alerts
          </Link>
        </div>
      )}
    </div>
  );
}

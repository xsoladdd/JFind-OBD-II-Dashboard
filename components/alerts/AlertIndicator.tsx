"use client";

import Link from "next/link";
import { Button, cx, linkClass } from "@/components/ui";
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
        className={cx(
          "inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-sm font-bold whitespace-nowrap",
          fresh ? "animate-pulse bg-danger text-on-danger" : active.length ? "bg-danger-soft text-danger-fg" : "bg-surface-2 text-fg-muted",
        )}
      >
        {active.length ? <span className="num text-base">{active.length}</span> : null}
        {active.length ? (active.length > 1 ? "alerts" : "alert") : ""}
        {muted && <span className={active.length ? "font-medium opacity-80" : ""}>{active.length ? "muted" : "Muted"}</span>}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Active alerts"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className="absolute top-13 right-0 z-50 w-80 max-w-[calc(100vw-2rem)] space-y-3 rounded-panel border border-line bg-surface-1 p-4 shadow-xl shadow-black/40"
        >
          {active.length ? (
            <ul className="space-y-1">
              {active.map((a) => (
                <li key={a.rule.id} className={a.acked ? "text-fg-faint" : "font-semibold text-danger-fg"}>
                  {describeRule(a.rule)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-muted">No alert is firing.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {fresh && (
              <Button variant="primary" size="sm" onClick={ackAll}>
                Acknowledge
              </Button>
            )}
            {muted ? (
              <Button size="sm" onClick={unmute}>
                Unmute
              </Button>
            ) : (
              MUTE_MINUTES.map((m) => (
                <Button key={m} size="sm" onClick={() => mute(m)}>
                  Mute {m} min
                </Button>
              ))
            )}
          </div>
          <Link href="/alerts" onClick={() => setOpen(false)} className={cx(linkClass, "inline-flex min-h-11 items-center text-sm")}>
            Manage alerts
          </Link>
        </div>
      )}
    </div>
  );
}

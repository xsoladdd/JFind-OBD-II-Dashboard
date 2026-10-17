"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";
import { ALERT_PREFIX } from "@/lib/alerts/engine";
import { MUTE_MINUTES, useAlerts } from "@/lib/store/alerts";
import { liveDef } from "@/lib/store/live";
import { useUnits } from "@/lib/store/settings";
import { dismissToast, useToasts } from "@/lib/store/toasts";
import { toDisplay } from "@/lib/units";
import { fmt } from "./live";

const MUTE = MUTE_MINUTES[0]!;

/**
 * A firing alert over the gauges: what, the value and a word, plus one huge Mute target. Presentation only; the
 * engine (lib/alerts) and the shell's AlertIndicator are unchanged. Hidden while muted.
 */
export function AlertBanner() {
  const active = useAlerts((s) => s.active);
  const muted = useAlerts((s) => s.mutedUntil > 0);
  const [units] = useUnits();
  const showing = active.length > 0 && !muted;

  // The banner says it all: drop the alert toasts so they don't stack on top of it.
  useEffect(() => {
    if (showing) useToasts.getState().toasts.forEach((t) => t.text.startsWith(ALERT_PREFIX) && dismissToast(t.id));
  }, [showing, active]);

  if (!showing) return null;
  const a = active[0]!;
  const def = liveDef(a.rule.pid);
  const v = toDisplay(a.value, def?.unit ?? "", units);
  return (
    <div role="alert" className="flex flex-wrap items-center gap-4 rounded-panel bg-danger p-4 text-on-danger shadow-xl shadow-black/40">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xl font-semibold">{def?.name ?? a.rule.pid}</p>
        <p className="num text-5xl leading-none">
          {fmt(v.value, v.unit)} <span className="font-sans text-2xl [font-stretch:100%]">{v.unit}</span>{" "}
          <span className="font-sans font-extrabold uppercase [font-stretch:100%]">{a.rule.op === "above" ? "High" : "Low"}</span>
        </p>
        {active.length > 1 && <p className="mt-1 text-lg font-semibold">+{active.length - 1} more</p>}
      </div>
      <Button
        size="drive"
        className="min-w-40 border-2 border-on-danger bg-on-danger text-danger-fg hover:bg-surface-1 hover:text-fg"
        onClick={() => {
          useAlerts.getState().ackAll();
          useAlerts.getState().mute(MUTE);
        }}
      >
        Mute {MUTE} min
      </Button>
    </div>
  );
}

/** Only trouble is shown: nothing while the link is fine. */
export function ReconnectingBanner() {
  return (
    <div role="status" className="flex items-center gap-4 rounded-panel border-2 border-warn bg-surface-1 p-4 shadow-xl shadow-black/40">
      <span aria-hidden className="size-5 shrink-0 animate-pulse rounded-full bg-warn" />
      <p className="text-4xl font-bold text-warn">Reconnecting</p>
    </div>
  );
}

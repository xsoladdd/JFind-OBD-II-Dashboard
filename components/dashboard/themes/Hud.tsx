"use client";

import { useEffect, useRef, useState } from "react";
import { COOLANT_HOT_C } from "@/lib/dashboard/zones";
import { useHudMirror, useRedline } from "@/lib/store/settings";
import { fmt, useDisplay } from "../live";

/** High-contrast heads-up display. Mirror flips it for reading as a windshield reflection. */
export function Hud() {
  const [mirror, setMirror] = useHudMirror();
  const [redline] = useRedline();
  const speed = useDisplay("010D");
  const rpm = useDisplay("010C");
  const coolant = useDisplay("0105");
  const ref = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFull = () => {
    const el = ref.current;
    if (!el) return;
    // Feature-detected: iPhone Safari has no element fullscreen, so fall back to a fixed overlay.
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el.requestFullscreen && !full) el.requestFullscreen().catch(() => setFull(true));
    else setFull((f) => !f);
  };

  const frac = Math.max(0, Math.min(1, (rpm.value ?? 0) / rpm.max));
  const hot = coolant.value !== undefined && coolant.value >= coolant.conv(COOLANT_HOT_C);

  return (
    <div ref={ref} className={`flex flex-col bg-black text-white ${full ? "fixed inset-0 z-50" : "min-h-[60vh] rounded-xl"}`}>
      <div className="flex justify-end gap-2 p-2 text-sm">
        <button onClick={() => setMirror(!mirror)} aria-pressed={mirror} className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300">
          Mirror
        </button>
        <button onClick={toggleFull} className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300">
          {full ? "Exit full screen" : "Full screen"}
        </button>
      </div>
      <div className={`flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-8 ${mirror ? "-scale-x-100" : ""}`}>
        <div className="text-center leading-none">
          <div className="font-mono text-[34vw] font-black tabular-nums text-lime-300 sm:text-[22vw] lg:text-[16rem]">
            {speed.value === undefined ? "—" : Math.round(speed.value)}
          </div>
          <div className="mt-2 text-2xl font-bold tracking-widest text-zinc-300">{speed.unit.toUpperCase()}</div>
        </div>
        <div className="w-full max-w-3xl">
          <div className="h-6 overflow-hidden rounded-full bg-zinc-900">
            <div
              className={`h-full ${(rpm.value ?? 0) >= redline ? "bg-red-500" : "bg-white"}`}
              style={{ width: `${frac * 100}%`, transition: "width 200ms linear" }}
            />
          </div>
          <div className="mt-2 flex justify-between font-mono text-2xl font-bold tabular-nums">
            <span>{fmt(rpm.value, "rpm")} RPM</span>
            <span className={hot ? "text-red-400" : "text-zinc-300"}>
              {fmt(coolant.value, coolant.unit)} {coolant.unit}
              {hot && " ⚠"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

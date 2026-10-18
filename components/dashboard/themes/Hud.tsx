"use client";

import { cx, NO_VALUE } from "@/components/ui";
import { COOLANT_HOT_C } from "@/lib/dashboard/zones";
import { useHudMirror, useRedline } from "@/lib/store/settings";
import { fmt, useDisplay } from "../live";

/**
 * Heads-up display for reading as a windshield reflection: pure black (it reflects nothing, a DESIGN.md exception),
 * huge speed, an RPM bar and coolant. Mirror (settings sheet) flips it.
 */
export function Hud() {
  const [mirror] = useHudMirror();
  const [redline] = useRedline();
  const speed = useDisplay("010D");
  const rpm = useDisplay("010C");
  const coolant = useDisplay("0105");
  const frac = Math.max(0, Math.min(1, (rpm.value ?? 0) / rpm.max));
  const over = (rpm.value ?? 0) >= redline;
  const hot = coolant.value !== undefined && coolant.value >= coolant.conv(COOLANT_HOT_C);

  return (
    <div className={cx("flex h-full flex-col justify-center gap-6 rounded-panel bg-black px-4 py-6 split:gap-3 split:py-3", mirror && "-scale-x-100")}>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center [container-type:size]">
        <div className="num text-[min(60cqw,calc((100cqh-3rem)*1.15))] leading-[0.82] text-accent split:text-[min(60cqw,calc((100cqh-1.75rem)*1.15))]">
          {speed.value === undefined ? NO_VALUE : Math.round(speed.value)}
        </div>
        <div className="text-3xl font-bold text-fg-muted split:text-xl">{speed.unit}</div>
      </div>
      <div className="mx-auto w-full max-w-3xl">
        <div className="h-8 overflow-hidden rounded-full bg-surface-1 split:h-5">
          <div
            className={cx("h-full origin-left", over ? "bg-danger" : "bg-fg")}
            style={{ transform: `scaleX(${frac})`, transition: "transform 100ms linear" }}
          />
        </div>
        <div className="num mt-3 flex flex-wrap justify-between gap-x-4 text-4xl split:mt-2 split:text-2xl">
          <span className={over ? "text-danger-fg" : "text-fg"}>
            {fmt(rpm.value, "rpm")} rpm{over && " Redline"}
          </span>
          <span className={hot ? "text-danger-fg" : "text-fg-muted"}>
            {fmt(coolant.value, coolant.unit)} {coolant.unit}
            {hot && " High"}
          </span>
        </div>
      </div>
    </div>
  );
}

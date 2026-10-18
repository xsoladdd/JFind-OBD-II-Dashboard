"use client";

import { cx, NO_VALUE } from "@/components/ui";
import { useLive } from "@/lib/store/live";
import { useDriveExtras, useRedline } from "@/lib/store/settings";
import { fmt, useDisplay } from "../live";
import { Readout } from "../Readout";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * The drive view: speed as the hero, RPM as a full-width bar with the redline marked, and up to two values the user
 * picks (settings sheet). Portrait stacks them; a landscape phone puts speed on the left.
 */
export function Drive() {
  const [redline] = useRedline();
  const [extras] = useDriveExtras();
  const supported = useLive((s) => s.supported);
  const speed = useDisplay("010D");
  const rpm = useDisplay("010C");
  const shown = extras.filter((id) => supported.includes(id));
  const over = (rpm.value ?? 0) >= redline;

  return (
    <div className="grid h-full grid-rows-[minmax(0,1fr)_auto_auto] gap-6 split:gap-3 short-wide:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] short-wide:grid-rows-2 short-wide:gap-x-8">
      <section aria-label="Speed" className="flex min-h-0 flex-col items-center justify-center [container-type:size] short-wide:row-span-2">
        <div className="num text-[min(60cqw,calc((100cqh-3rem)*1.15))] leading-[0.82] split:text-[min(60cqw,calc((100cqh-1.75rem)*1.15))]">
          {speed.value === undefined ? NO_VALUE : Math.round(speed.value)}
        </div>
        <div className="text-3xl font-semibold text-fg-muted split:text-xl">{speed.unit}</div>
      </section>

      <section aria-label="Engine speed" className="short-wide:self-end">
        <div className="flex items-baseline justify-between gap-3">
          <div className={cx("num text-6xl leading-none split:text-4xl", over && "text-danger-fg")}>
            {fmt(rpm.value, "rpm")}
            <span className="ml-1.5 font-sans text-xl font-medium text-fg-faint [font-stretch:100%]">rpm</span>
          </div>
          {over && <span className="text-3xl font-bold text-danger-fg split:text-xl">Redline</span>}
        </div>
        <div
          role="meter"
          aria-label="Engine RPM"
          aria-valuemin={rpm.min}
          aria-valuemax={rpm.max}
          aria-valuenow={rpm.value === undefined ? undefined : Math.round(rpm.value)}
          className="relative mt-3 h-12 overflow-hidden rounded-control bg-surface-2 split:mt-2 split:h-6"
        >
          <div
            className={cx("h-full origin-left", over ? "bg-danger" : "bg-accent")}
            style={{ transform: `scaleX(${clamp01((rpm.value ?? rpm.min) / rpm.max)})`, transition: "transform 100ms linear" }}
          />
          {/* The redline, as a position as well as a colour. */}
          <div aria-hidden className="absolute inset-y-0 w-1.5 bg-danger" style={{ left: `${clamp01(redline / rpm.max) * 100}%` }} />
        </div>
      </section>

      {/* A small split-screen pane keeps speed and RPM only: there's no room for the extras at a glanceable size. */}
      {shown.length > 0 && (
        <div className="grid grid-cols-2 gap-6 short-wide:self-start split:hidden">
          {shown.map((id) => (
            <Readout key={id} id={id} valueClass="text-6xl" />
          ))}
        </div>
      )}
    </div>
  );
}

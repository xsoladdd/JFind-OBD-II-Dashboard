"use client";

import { cx, NO_VALUE } from "@/components/ui";
import { SHIFT_START } from "@/lib/dashboard/zones";
import { useRedline } from "@/lib/store/settings";
import { arcPath } from "../Gauge";
import { fmt, useDisplay } from "../live";
import { Readout } from "../Readout";

const LEDS = 10;
const START = 135;
const SWEEP = 270;

/** Lights from SHIFT_START × redline: accent, then warn, then danger (position carries the meaning too). */
function ShiftLights({ rpm, redline }: { rpm: number; redline: number }) {
  const from = redline * SHIFT_START;
  const lit = Math.max(0, Math.min(LEDS, Math.ceil(((rpm - from) / (redline - from)) * LEDS)));
  const flash = rpm >= redline;
  return (
    <div className={cx("flex gap-1.5", flash && "animate-pulse")} role="meter" aria-label="Shift lights" aria-valuenow={lit} aria-valuemin={0} aria-valuemax={LEDS}>
      {Array.from({ length: LEDS }, (_, i) => {
        const color = i < 4 ? "bg-accent" : i < 7 ? "bg-warn" : "bg-danger";
        return <span key={i} className={cx("h-5 flex-1 rounded-[6px] sm:h-6", i < lit ? color : "bg-surface-2")} />;
      })}
    </div>
  );
}

/** A big tach with the speed in the middle and the shift lights above; three values below (beside it in landscape). */
export function Sport() {
  const [redline] = useRedline();
  const rpm = useDisplay("010C");
  const speed = useDisplay("010D");
  const frac = Math.max(0, Math.min(1, ((rpm.value ?? 0) - rpm.min) / (rpm.max - rpm.min)));
  const redFrom = START + (redline / rpm.max) * SWEEP;
  const arcLen = 2 * Math.PI * 86 * (SWEEP / 360);
  const over = (rpm.value ?? 0) >= redline;

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-4 short:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] short:grid-rows-[auto_minmax(0,1fr)] short:gap-x-6">
      <ShiftLights rpm={rpm.value ?? 0} redline={redline} />
      <svg
        viewBox="0 0 200 186"
        className="block h-full min-h-0 w-full short:row-start-2"
        role="img"
        aria-label={`Speed ${fmt(speed.value, speed.unit)} ${speed.unit}, RPM ${fmt(rpm.value, "rpm")}${over ? ", redline" : ""}`}
      >
        <path d={arcPath(86, START, START + SWEEP)} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
        <path d={arcPath(97, redFrom, START + SWEEP)} fill="none" stroke="var(--danger)" strokeWidth="5" />
        <path
          d={arcPath(86, START, START + SWEEP)}
          fill="none"
          stroke={over ? "var(--danger)" : "var(--accent)"}
          strokeWidth="14"
          strokeDasharray={arcLen}
          strokeDashoffset={arcLen * (1 - frac)}
          style={{ transition: "stroke-dashoffset 100ms linear" }}
        />
        {Array.from({ length: Math.floor(rpm.max / 1000) + 1 }, (_, k) => {
          const a = ((START + ((k * 1000) / rpm.max) * SWEEP) * Math.PI) / 180;
          return (
            <text
              key={k}
              x={100 + 64 * Math.cos(a)}
              y={100 + 64 * Math.sin(a)}
              fill={k * 1000 >= redline ? "var(--danger-fg)" : "var(--fg-faint)"}
              fontSize="13"
              textAnchor="middle"
              dominantBaseline="middle"
              className="num"
            >
              {k}
            </text>
          );
        })}
        <text x="100" y="116" fill="var(--fg)" fontSize="62" textAnchor="middle" className="num">
          {speed.value === undefined ? NO_VALUE : Math.round(speed.value)}
        </text>
        <text x="100" y="138" fill="var(--fg-muted)" fontSize="15" textAnchor="middle">
          {speed.unit}
        </text>
        <text x="100" y="172" fill={over ? "var(--danger-fg)" : "var(--fg)"} fontSize="22" textAnchor="middle" className="num">
          {fmt(rpm.value, "rpm")} rpm{over && " Redline"}
        </text>
      </svg>
      <div className="grid grid-cols-3 gap-4 short:row-span-2 short:row-start-1 short:grid-cols-1 short:content-center">
        {["0105", "0111", "012F"].map((id) => (
          <Readout key={id} id={id} valueClass="text-4xl sm:text-5xl" />
        ))}
      </div>
    </div>
  );
}

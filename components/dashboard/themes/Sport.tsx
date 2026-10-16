"use client";

import { SHIFT_START } from "@/lib/dashboard/zones";
import { useRedline } from "@/lib/store/settings";
import { arcPath } from "../Gauge";
import { fmt, useDisplay } from "../live";

const LEDS = 10;
const START = 135;
const SWEEP = 270;

function ShiftLights({ rpm, redline }: { rpm: number; redline: number }) {
  const from = redline * SHIFT_START;
  const lit = Math.max(0, Math.min(LEDS, Math.ceil(((rpm - from) / (redline - from)) * LEDS)));
  const flash = rpm >= redline;
  return (
    <div className={`flex justify-center gap-1.5 ${flash ? "animate-pulse" : ""}`} role="meter" aria-label="Shift lights" aria-valuenow={lit} aria-valuemin={0} aria-valuemax={LEDS}>
      {Array.from({ length: LEDS }, (_, i) => {
        const color = i < 4 ? "bg-emerald-400" : i < 7 ? "bg-amber-400" : "bg-red-500";
        return <span key={i} className={`h-3 w-6 rounded-sm sm:h-4 sm:w-10 ${i < lit ? color : "bg-zinc-800"}`} />;
      })}
    </div>
  );
}

export function Sport() {
  const [redline] = useRedline();
  const rpm = useDisplay("010C");
  const speed = useDisplay("010D");
  const coolant = useDisplay("0105");
  const throttle = useDisplay("0111");
  const fuel = useDisplay("012F");
  const frac = Math.max(0, Math.min(1, ((rpm.value ?? 0) - rpm.min) / (rpm.max - rpm.min)));
  const redFrom = START + (redline / rpm.max) * SWEEP;
  const arcLen = 2 * Math.PI * 88 * (SWEEP / 360);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <ShiftLights rpm={rpm.value ?? 0} redline={redline} />
      <svg viewBox="0 0 200 175" className="mx-auto w-full max-w-xl" role="img" aria-label={`RPM ${fmt(rpm.value, "rpm")}, speed ${fmt(speed.value)} ${speed.unit}`}>
        <path d={arcPath(88, START, START + SWEEP)} fill="none" stroke="#18181b" strokeWidth="14" />
        <path d={arcPath(88, redFrom, START + SWEEP)} fill="none" stroke="#7f1d1d" strokeWidth="14" />
        <path
          d={arcPath(88, START, START + SWEEP)}
          fill="none"
          stroke={(rpm.value ?? 0) >= redline ? "#ef4444" : "#38bdf8"}
          strokeWidth="14"
          strokeDasharray={arcLen}
          strokeDashoffset={arcLen * (1 - frac)}
          style={{ transition: "stroke-dashoffset 200ms linear" }}
        />
        {Array.from({ length: Math.floor(rpm.max / 1000) + 1 }, (_, k) => {
          const a = ((START + ((k * 1000) / rpm.max) * SWEEP) * Math.PI) / 180;
          return (
            <text key={k} x={100 + 68 * Math.cos(a)} y={100 + 68 * Math.sin(a)} fill={k * 1000 >= redline ? "#f87171" : "#71717a"} fontSize="10" textAnchor="middle" dominantBaseline="middle">
              {k}
            </text>
          );
        })}
        <text x="100" y="108" fill="#fafafa" fontSize="52" fontWeight="800" textAnchor="middle" className="tabular-nums">
          {speed.value === undefined ? "—" : Math.round(speed.value)}
        </text>
        <text x="100" y="128" fill="#a1a1aa" fontSize="11" textAnchor="middle">
          {speed.unit}
        </text>
        <text x="100" y="160" fill="#e4e4e7" fontSize="15" fontWeight="600" textAnchor="middle" className="tabular-nums">
          {fmt(rpm.value, "rpm")} rpm
        </text>
      </svg>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[coolant, throttle, fuel].map((d) => (
          <div key={d.name} className="rounded-lg bg-zinc-900 px-2 py-2">
            <div className="truncate text-[11px] uppercase tracking-wide text-zinc-500">{d.name}</div>
            <div className="font-mono text-lg tabular-nums">
              {fmt(d.value, d.unit)}
              <span className="ml-1 text-xs text-zinc-500">{d.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

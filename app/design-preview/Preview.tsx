"use client";

// TEMPORARY: design-direction mockups for JOID-0014. Deleted once a direction is chosen.
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { fmt, useDisplay } from "@/components/dashboard/live";
import { arcPath } from "@/components/dashboard/Gauge";
import { COOLANT_HOT_C, FUEL_LOW_PCT } from "@/lib/dashboard/zones";
import { describeProtocol } from "@/lib/elm/protocols";
import { usePolling } from "@/lib/polling";
import { useConnection } from "@/lib/store/connection";
import { useMounted } from "@/components/connect/hooks";
import { useLive } from "@/lib/store/live";
import { useRedline } from "@/lib/store/settings";
import { DIRECTIONS, type Direction, type DirectionId } from "./directions";

const CSS = `
.pv { background: var(--bg); color: var(--text); font-family: var(--font-ui), system-ui, sans-serif; }
.pv .num { font-family: var(--font-num), ui-monospace, monospace; font-stretch: var(--num-stretch); font-weight: var(--num-weight); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.pv .panel { background: var(--s1); border: 1px solid var(--line); border-radius: var(--r-panel); }
.pv .btn { white-space: nowrap; min-height: 48px; padding: 0 20px; border-radius: var(--r-ctl); font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
.pv .btn-primary { background: var(--accent); color: var(--on-accent); }
.pv .btn-secondary { border: 1px solid var(--line); color: var(--text); background: var(--s2); }
.pv .btn-ghost { color: var(--muted); }
.pv .muted { color: var(--muted); } .pv .faint { color: var(--faint); }
.pv .lbl-mono-caps { font-family: var(--font-num), monospace; text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px; color: var(--muted); }
.pv .lbl-sentence { font-size: 14px; color: var(--muted); }
`;

const hashScreen = () => (location.hash === "#dashboard" ? "dashboard" : "connect");
const onHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

const PRIMARY = ["Dashboard", "Diagnostics", "Garage", "Trips"];
const ALL = ["Connect", ...PRIMARY, "ECU", "Alerts", "History", "PIDs"];

export function Preview({ id }: { id: DirectionId }) {
  const d = DIRECTIONS[id];
  const screen = useSyncExternalStore(onHash, hashScreen, () => "connect");
  useEffect(() => {
    const c = useConnection.getState();
    if (c.status === "idle") void c.connect("demo");
  }, []);
  if (!useMounted()) return null;

  return (
    <div className={`pv ${d.fontClass} fixed inset-0 z-[100] overflow-y-auto`} style={d.vars}>
      <style>{CSS}</style>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-4" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
        <Wordmark d={d} />
        <div className="ml-auto min-w-0">
          <Chip d={d} />
        </div>
      </header>
      <div className="flex">
        <nav className="hidden w-56 shrink-0 border-r p-3 md:block" style={{ borderColor: "var(--line)", minHeight: "calc(100dvh - 56px)" }}>
          <ul className="space-y-1">
            {ALL.map((n) => {
              const active = n.toLowerCase() === screen;
              return (
                <li key={n}>
                  <a
                    href={n === "Dashboard" ? "#dashboard" : n === "Connect" ? "#connect" : undefined}
                    className="flex min-h-11 items-center px-3 text-[15px] font-medium"
                    style={{
                      borderRadius: "var(--r-ctl)",
                      background: active ? "var(--s2)" : undefined,
                      color: active ? "var(--text)" : "var(--muted)",
                      boxShadow: active && d.id !== "nightline" ? "inset 3px 0 0 var(--accent)" : undefined,
                    }}
                  >
                    {d.labels === "mono-caps" ? <span className="lbl-mono-caps" style={{ color: "inherit", fontSize: 13 }}>{n}</span> : n}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <main className="min-w-0 flex-1 pb-24 md:pb-8">{screen === "dashboard" ? <Dash d={d} /> : <Connect d={d} />}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 border-t md:hidden" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
        <ul className="flex">
          {[...PRIMARY, "More"].map((n) => {
            const active = n.toLowerCase() === screen;
            return (
              <li key={n} className="flex-1">
                <a
                  href={n === "Dashboard" ? "#dashboard" : undefined}
                  className="relative flex min-h-14 items-center justify-center text-[13px] font-semibold"
                  style={{ color: active ? "var(--text)" : "var(--faint)" }}
                >
                  {active && <span className="absolute inset-x-4 top-0 h-[3px]" style={{ background: "var(--accent)", borderRadius: 2 }} />}
                  {d.labels === "mono-caps" ? <span className="lbl-mono-caps" style={{ color: "inherit", fontSize: 11 }}>{n}</span> : n}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function Wordmark({ d }: { d: Direction }) {
  if (d.id === "telemetry") return <span className="lbl-mono-caps shrink-0" style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>OBD/DASH</span>;
  if (d.id === "cluster")
    return (
      <span className="shrink-0 text-lg font-extrabold uppercase" style={{ fontStretch: "75%", letterSpacing: "0.02em" }}>
        OBD Dash
      </span>
    );
  return <span className="shrink-0 text-base font-semibold tracking-tight">OBD Dash</span>;
}

function useConn() {
  const s = useConnection();
  const proto = s.protocol ? describeProtocol(s.protocol).name : "";
  return { ...s, proto };
}

function Chip({ d }: { d: Direction }) {
  const s = useConn();
  const ok = s.status === "connected";
  return (
    <a href="#connect" className="flex min-h-11 items-center gap-2 px-3 text-sm" style={{ borderRadius: "var(--r-ctl)", background: "var(--s1)", border: "1px solid var(--line)" }}>
      <span className="h-2 w-2 shrink-0" style={{ background: ok ? "var(--ok)" : "var(--warn)", borderRadius: d.id === "telemetry" ? 0 : 99 }} aria-hidden />
      <span className="font-semibold">{ok ? "Connected" : "Connecting"}</span>
      <span className="hidden truncate muted sm:inline">{s.proto}</span>
      {s.voltage && <span className="num">{s.voltage}</span>}
    </a>
  );
}

function Label({ d, children }: { d: Direction; children: ReactNode }) {
  return <span className={d.labels === "mono-caps" ? "lbl-mono-caps" : "lbl-sentence"}>{children}</span>;
}

function Connect({ d }: { d: Direction }) {
  const s = useConn();
  const volts = s.voltage?.replace(/V$/i, "") ?? "—";
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 md:py-10">
      <section className="panel p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label d={d}>Adapter</Label>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{s.status === "connected" ? "Connected" : "Connecting"}</h1>
            <p className="mt-1 truncate muted">{s.deviceName || "Simulator (demo)"}</p>
          </div>
          <div className="text-right">
            <Label d={d}>Battery</Label>
            <div className="num mt-1 text-5xl leading-none md:text-6xl">
              {volts}
              <span className="ml-1 text-lg faint" style={{ fontWeight: 500 }}>V</span>
            </div>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-[15px] md:grid-cols-3" style={{ borderColor: "var(--line)" }}>
          <div>
            <dt><Label d={d}>Protocol</Label></dt>
            <dd className="mt-0.5 font-medium">{s.proto || "—"}</dd>
          </div>
          <div>
            <dt><Label d={d}>Chip</Label></dt>
            <dd className="mt-0.5 font-medium">{s.elmVersion || "—"}</dd>
          </div>
          <div>
            <dt><Label d={d}>Mode</Label></dt>
            <dd className="mt-0.5 font-medium">Demo</dd>
          </div>
        </dl>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:flex">
          <a href="#dashboard" className="btn btn-primary">Open dashboard</a>
          <button className="btn btn-secondary" onClick={() => void s.disconnect()}>Disconnect</button>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold">Saving to OBD Dash</h2>
        <p className="mt-1 muted">Settings, scans, cars and debug logs are plain files in this folder.</p>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-secondary">Change folder</button>
          <button className="btn btn-ghost">Forget folder</button>
        </div>
      </section>

      <section className="panel divide-y" style={{ borderColor: "var(--line)" }}>
        {["Debug console", "Adapter settings", "Troubleshooting"].map((t) => (
          <div key={t} className="flex min-h-14 items-center justify-between px-5" style={{ borderColor: "var(--line)" }}>
            <span className="font-medium">{t}</span>
            <span className="faint" aria-hidden>{d.labels === "mono-caps" ? "[+]" : "Show"}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

const THEMES = ["Classic", "Sport", "Minimal", "Engineer", "HUD", "Custom"];

function Dash({ d }: { d: Direction }) {
  usePolling();
  const hz = useLive((s) => s.hz);
  const [redline] = useRedline();
  const rpm = useDisplay("010C");
  const speed = useDisplay("010D");
  const coolant = useDisplay("0105");
  const fuel = useDisplay("012F");
  const gauges = [
    { g: rpm, zone: { from: redline, to: rpm.max, tone: "danger" as const }, scale: 1000 },
    { g: speed, zone: null, scale: 1 },
    { g: coolant, zone: { from: coolant.conv(COOLANT_HOT_C), to: coolant.max, tone: "danger" as const }, scale: 1 },
    { g: fuel, zone: { from: fuel.min, to: fuel.conv(FUEL_LOW_PCT), tone: "warn" as const }, scale: 1 },
  ];
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 md:py-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full overflow-x-auto p-1" style={{ background: "var(--s1)", border: "1px solid var(--line)", borderRadius: "var(--r-ctl)" }}>
          {THEMES.map((t) => (
            <span
              key={t}
              className="flex min-h-10 shrink-0 items-center px-3 text-sm font-semibold"
              style={{ borderRadius: "var(--r-ctl)", background: t === "Classic" ? "var(--s2)" : undefined, color: t === "Classic" ? "var(--text)" : "var(--faint)" }}
            >
              {t}
            </span>
          ))}
        </div>
        <span className="ml-auto num text-sm faint">{hz.toFixed(1)} Hz</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {gauges.map(({ g, zone, scale }) => {
          const hit = zone && g.value !== undefined && g.value >= zone.from && g.value <= zone.to ? zone.tone : null;
          return (
            <figure key={g.name} className="panel flex flex-col p-3 md:p-5">
              <figcaption className="flex items-center justify-between gap-2">
                <Label d={d}>{g.name}</Label>
                {hit && <span className="text-xs font-bold" style={{ color: `var(--${hit})` }}>{hit === "danger" ? "HIGH" : "LOW"}</span>}
              </figcaption>
              <Dial d={d} g={g} zone={zone} scale={scale} hit={hit} />
            </figure>
          );
        })}
      </div>
    </div>
  );
}

const START = 135;
const SWEEP = 270;

function Dial({
  d,
  g,
  zone,
  scale,
  hit,
}: {
  d: Direction;
  g: ReturnType<typeof useDisplay>;
  zone: { from: number; to: number; tone: "danger" | "warn" } | null;
  scale: number;
  hit: "danger" | "warn" | null;
}) {
  const frac = (n: number) => Math.max(0, Math.min(1, (n - g.min) / (g.max - g.min)));
  const ang = (n: number) => START + frac(n) * SWEEP;
  const val = g.value ?? g.min;
  const valueColor = hit ? `var(--${hit})` : "var(--text)";
  const zoneColor = zone ? `var(--${zone.tone})` : "";

  return (
    <div className="relative mx-auto w-full max-w-64">
      <svg viewBox="-4 -4 208 180" className="w-full" aria-hidden>
        {d.gauge === "thick" && (
          <>
            <path d={arcPath(82, START, START + SWEEP)} fill="none" stroke="var(--s2)" strokeWidth="14" strokeLinecap="round" />
            <path d={arcPath(82, START, Math.max(START + 0.5, ang(val)))} fill="none" stroke={hit ? valueColor : "var(--accent)"} strokeWidth="14" strokeLinecap="round" />
            {zone && <path d={arcPath(97, ang(zone.from), ang(zone.to))} fill="none" stroke={zoneColor} strokeWidth="4" />}
          </>
        )}
        {d.gauge === "thin" && (
          <>
            <path d={arcPath(84, START, START + SWEEP)} fill="none" stroke="var(--s2)" strokeWidth="4" strokeLinecap="round" />
            <path d={arcPath(84, START, Math.max(START + 0.5, ang(val)))} fill="none" stroke={hit ? valueColor : "var(--accent)"} strokeWidth="4" strokeLinecap="round" />
            {zone && <path d={arcPath(95, ang(zone.from), ang(zone.to))} fill="none" stroke={zoneColor} strokeWidth="3" />}
          </>
        )}
        {d.gauge === "ticks" &&
          Array.from({ length: 41 }, (_, i) => {
            const a = START + (i / 40) * SWEEP;
            const n = g.min + (i / 40) * (g.max - g.min);
            const inZone = zone && n >= zone.from && n <= zone.to;
            const lit = n <= val;
            const r1 = i % 5 === 0 ? 70 : 76;
            const rad = (a * Math.PI) / 180;
            return (
              <line
                key={i}
                x1={100 + r1 * Math.cos(rad)}
                y1={100 + r1 * Math.sin(rad)}
                x2={100 + 88 * Math.cos(rad)}
                y2={100 + 88 * Math.sin(rad)}
                stroke={lit ? (inZone ? zoneColor : "var(--text)") : inZone ? zoneColor : "var(--line)"}
                strokeOpacity={lit || inZone ? 1 : 1}
                strokeWidth={i % 5 === 0 ? 3 : 2}
              />
            );
          })}
      </svg>
      <div className="absolute inset-x-0 top-[34%] text-center">
        <div className={`num leading-none ${d.id === "telemetry" ? "text-[34px] md:text-5xl" : "text-[42px] md:text-6xl"}`} style={{ color: valueColor }}>
          {g.value === undefined ? "-" : fmt(g.value, g.unit)}
        </div>
        <div className="mt-1 text-sm faint">{g.unit}</div>
      </div>
    </div>
  );
}

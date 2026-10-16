"use client";

import { useState } from "react";
import type { Scan } from "@/lib/diagnostics/scan";
import { describeDtc } from "@/lib/obd/dtc";
import { PIDS } from "@/lib/obd/pids";

const TABS = [
  {
    key: "stored",
    label: "Stored",
    mode: "03",
    badge: "Confirmed",
    color: "bg-red-600/25 text-red-200",
    hint: "Confirmed faults. These turn on the check-engine light.",
  },
  {
    key: "pending",
    label: "Pending",
    mode: "07",
    badge: "Pending",
    color: "bg-amber-600/25 text-amber-200",
    hint: "Seen during the current or last drive cycle but not confirmed yet.",
  },
  {
    key: "permanent",
    label: "Permanent",
    mode: "0A",
    badge: "Permanent",
    color: "bg-fuchsia-600/25 text-fuchsia-200",
    hint: "Can't be cleared with a scan tool. The ECU removes them once it has verified the repair.",
  },
] as const;

const fmt = (n: number) => +n.toFixed(2);

/** Stored / pending / permanent tabs; tapping a code shows its freeze frame. Key it by scan.at to reset. */
export function CodeTabs({ scan }: { scan: Scan }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("stored");
  const [selected, setSelected] = useState<string | null>(null);
  const t = TABS.find((x) => x.key === tab)!;
  const list = scan[tab];
  const ff = scan.freezeFrame;

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div role="tablist" aria-label="Trouble code types" className="grid grid-cols-3 border-b border-zinc-800">
        {TABS.map((x) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            className={`px-2 py-3 text-sm font-semibold ${tab === x.key ? "border-b-2 border-sky-400 text-sky-200" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {x.label} <span className="font-normal">({scan[x.key]?.length ?? "?"})</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" className="p-4">
        <p className="text-sm text-zinc-400">
          {t.hint} <span className="font-mono text-xs text-zinc-500">Mode {t.mode}</span>
        </p>
        {list === null ? (
          <p className="mt-3 text-sm text-red-300">Couldn&apos;t read these codes. See the errors above, then read again.</p>
        ) : list.length === 0 ? (
          <p className="mt-3 text-sm text-emerald-300">No {t.label.toLowerCase()} codes.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {list.map((code) => {
              const open = selected === code;
              return (
                <li key={code} className="rounded-md border border-zinc-800">
                  <button
                    onClick={() => setSelected(open ? null : code)}
                    aria-expanded={open}
                    className="flex w-full items-start gap-3 p-3 text-left hover:bg-zinc-800/60"
                  >
                    <span className="font-mono text-lg font-bold">{code}</span>
                    <span className="flex-1 text-sm text-zinc-300">{describeDtc(code)}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${t.color}`}>{t.badge}</span>
                  </button>
                  {open && (
                    <div className="border-t border-zinc-800 p-3 text-sm">
                      <h4 className="font-semibold">
                        Freeze frame <span className="font-mono text-xs text-zinc-500">Mode 02, frame 0</span>
                      </h4>
                      {ff && (ff.dtc === code || ff.dtc === null) ? (
                        <>
                          <p className="mt-1 text-zinc-400">
                            Sensor values the ECU saved when {ff.dtc ? "this code was set" : "the frame was stored (it didn't say for which code)"}.
                          </p>
                          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                            {ff.values.map((v) => (
                              <div key={v.id} className="contents">
                                <dt className="text-zinc-400">{v.name}</dt>
                                <dd className="text-right font-mono">
                                  {PIDS[v.id]?.text?.(v.value) ?? `${fmt(v.value)} ${v.unit}`}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </>
                      ) : (
                        <p className="mt-1 text-zinc-400">
                          No freeze frame for {code}. Generic OBD-II exposes one freeze frame (frame 0)
                          {ff?.dtc ? `, and it belongs to ${ff.dtc}` : ", and none is stored right now"}.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { Badge, panelClass, SegmentedControl, StoppedOnly } from "@/components/ui";
import type { Scan } from "@/lib/diagnostics/scan";
import { describeDtc } from "@/lib/obd/dtc";
import { PIDS } from "@/lib/obd/pids";

const TABS = [
  {
    key: "stored",
    label: "Stored",
    mode: "03",
    badge: "Confirmed",
    tone: "danger",
    hint: "Confirmed faults. These turn on the check-engine light.",
  },
  {
    key: "pending",
    label: "Pending",
    mode: "07",
    badge: "Pending",
    tone: "warn",
    hint: "Seen during the current or last drive cycle but not confirmed yet.",
  },
  {
    key: "permanent",
    label: "Permanent",
    mode: "0A",
    badge: "Permanent",
    tone: "neutral",
    hint: "Can’t be cleared with a scan tool. The ECU removes them once it has verified the repair.",
  },
] as const;

type TabKey = (typeof TABS)[number]["key"];
const fmt = (n: number) => +n.toFixed(2);

/** Stored / pending / permanent lists; tapping a code shows its freeze frame (parked only). Key it by scan.at to reset. */
export function CodeTabs({ scan }: { scan: Scan }) {
  const [tab, setTab] = useState<TabKey>("stored");
  const [selected, setSelected] = useState<string | null>(null);
  const t = TABS.find((x) => x.key === tab)!;
  const list = scan[tab];
  const ff = scan.freezeFrame;

  return (
    <section aria-labelledby="codes-title" className={`${panelClass} space-y-4 p-4 sm:p-5`}>
      <h2 id="codes-title" className="sr-only">
        Trouble codes
      </h2>
      <SegmentedControl
        size="drive"
        className="grid-cols-3! [&>button]:px-1"
        label="Trouble code types"
        value={tab}
        onChange={setTab}
        options={TABS.map((x) => ({ value: x.key, label: `${x.label} ${scan[x.key]?.length ?? "?"}` }))}
      />

      {list === null ? (
        <p className="text-danger-fg">Couldn’t read these codes. See the errors above, then read again.</p>
      ) : list.length === 0 ? (
        <p className="text-lg font-semibold">No {t.label.toLowerCase()} codes</p>
      ) : (
        <ul className="space-y-3">
          {list.map((code) => {
            const open = selected === code;
            return (
              <li key={code} className="rounded-control border border-line">
                <button
                  type="button"
                  onClick={() => setSelected(open ? null : code)}
                  aria-expanded={open}
                  className="flex min-h-18 w-full flex-col gap-1 rounded-control px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-2"
                >
                  <span className="flex w-full items-center justify-between gap-3">
                    <span translate="no" className="num text-3xl">{code}</span>
                    <Badge tone={t.tone}>{t.badge}</Badge>
                  </span>
                  <span className="text-fg-muted">{describeDtc(code)}</span>
                </button>
                {open && (
                  <div className="border-t border-line p-4">
                    <StoppedOnly label="Freeze frame">
                      <h3 className="font-semibold">
                        Freeze frame <span className="font-mono text-sm text-fg-faint">Mode 02, frame 0</span>
                      </h3>
                      {ff && (ff.dtc === code || ff.dtc === null) ? (
                        <>
                          <p className="mt-1 text-sm text-fg-muted">
                            Sensor values the ECU saved when {ff.dtc ? "this code was set" : "the frame was stored (it didn’t say for which code)"}.
                          </p>
                          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                            {ff.values.map((v) => (
                              <div key={v.id} className="contents">
                                <dt className="text-fg-muted">{v.name}</dt>
                                <dd className="num text-right text-lg">{PIDS[v.id]?.text?.(v.value) ?? `${fmt(v.value)} ${v.unit}`}</dd>
                              </div>
                            ))}
                          </dl>
                        </>
                      ) : (
                        <p className="mt-1 text-fg-muted">
                          No freeze frame for {code}. Generic OBD-II exposes one freeze frame (frame 0)
                          {ff?.dtc ? `, and it belongs to ${ff.dtc}` : ", and none is stored right now"}.
                        </p>
                      )}
                    </StoppedOnly>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-sm text-fg-faint">
        {t.hint} <span className="font-mono">Mode {t.mode}</span>
      </p>
    </section>
  );
}

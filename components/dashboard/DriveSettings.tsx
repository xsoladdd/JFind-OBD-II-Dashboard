"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClass, Field, Input, SegmentedControl, Select, Sheet, StoppedOnly, Switch } from "@/components/ui";
import { NAV } from "@/lib/nav";
import { setSimParked, useSimPark } from "@/lib/sim/park";
import { useConnection } from "@/lib/store/connection";
import { liveDef, useLive } from "@/lib/store/live";
import {
  DRIVE_EXTRAS_MAX,
  useDriveExtras,
  useHudMirror,
  useNightDim,
  useRedline,
  useUnits,
  type ThemeId,
} from "@/lib/store/settings";
import { CustomLayoutControls } from "./themes/Custom";

export const THEME_OPTIONS: { value: ThemeId; label: string }[] = [
  { value: "drive", label: "Drive" },
  { value: "classic", label: "Classic" },
  { value: "sport", label: "Sport" },
  { value: "hud", label: "HUD" },
  { value: "minimal", label: "Minimal" },
  { value: "custom", label: "Custom" },
  { value: "engineer", label: "Engineer" },
];

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3 border-t border-line px-2 pt-4 pb-5 first:border-t-0 first:pt-1">
    <h3 className="text-base font-semibold text-fg-muted">{title}</h3>
    {children}
  </section>
);

/**
 * Everything the dashboard used to show around the gauges, in one sheet. Display choices stay usable while moving
 * (opening the sheet is the deliberate step); anything typed or fiddly sits in the parked-only section.
 */
export function DriveSettings({
  open,
  onClose,
  theme,
  setTheme,
  editing,
  setEditing,
  wake,
  fullscreen,
}: {
  open: boolean;
  onClose: () => void;
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  editing: boolean;
  setEditing: (on: boolean) => void;
  wake: boolean;
  fullscreen: { supported: boolean; active: boolean; toggle: () => void };
}) {
  const [units, setUnits] = useUnits();
  const [dim, setDim] = useNightDim();
  const [mirror, setMirror] = useHudMirror();
  const demo = useConnection((s) => s.mode === "demo");
  const parked = useSimPark((s) => s.parked);
  const hz = useLive((s) => s.hz);

  return (
    <Sheet open={open} onClose={onClose} title="Menu">
      <Section title="Display">
        <SegmentedControl size="drive" label="Dashboard layout" options={THEME_OPTIONS} value={theme} onChange={setTheme} />
        <SegmentedControl
          size="drive"
          label="Units"
          options={[
            { value: "metric", label: "km/h, °C" },
            { value: "imperial", label: "mph, °F" },
          ]}
          value={units}
          onChange={setUnits}
        />
        <Switch className="min-h-18" checked={dim} onChange={setDim} label="Night dim" description="Lower brightness for driving in the dark" />
        {fullscreen.supported && <Switch className="min-h-18" checked={fullscreen.active} onChange={fullscreen.toggle} label="Full screen" />}
        {theme === "hud" && <Switch className="min-h-18" checked={mirror} onChange={setMirror} label="Mirror HUD" description="For reading as a windshield reflection" />}
        {demo && (
          <Switch className="min-h-18" checked={parked} onChange={setSimParked} label="Hold parked (Demo)" description="Keep the simulated car stopped" />
        )}
        <p className="text-sm text-fg-faint">
          {wake ? "Screen kept on" : "Screen may sleep: this browser didn't allow keeping it on"}. <span className="num">{hz.toFixed(1)}</span> reads
          per second.
        </p>
      </Section>

      <Section title="Go to">
        <ul className="grid grid-cols-2 gap-3">
          {NAV.filter((n) => n.href !== "/dashboard").map((n) => (
            <li key={n.href}>
              <Link href={n.href} className={`${buttonClass("secondary", "drive")} w-full`}>
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="When parked">
        <StoppedOnly label="Redline and layout settings">
          <div className="space-y-4">
            <RedlineField />
            {theme === "drive" && <DriveExtras />}
            {theme === "custom" && (
              <CustomLayoutControls
                editing={editing}
                setEditing={(on) => {
                  setEditing(on);
                  if (on) onClose(); // show the grid being edited
                }}
              />
            )}
          </div>
        </StoppedOnly>
      </Section>
    </Sheet>
  );
}

function RedlineField() {
  const [redline, setRedline] = useRedline();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Field label="Redline (rpm)" hint="Your car's redline: drives the red zone and the shift lights.">
      <Input
        name="redline"
        type="number"
        inputMode="numeric"
        autoComplete="off"
        min={1000}
        max={12000}
        step={100}
        value={draft ?? redline}
        onChange={(e) => {
          setDraft(e.currentTarget.value); // let partial input like "6" through while typing
          const v = e.currentTarget.valueAsNumber;
          if (v >= 1000 && v <= 12000) setRedline(v);
        }}
        onBlur={() => setDraft(null)}
      />
    </Field>
  );
}

function DriveExtras() {
  const [extras, setExtras] = useDriveExtras();
  const supported = useLive((s) => s.supported);
  // Keep the saved picks listed even before the car's supported PIDs are known.
  const options = [...new Set([...extras, ...supported])].filter((p) => p !== "010D" && p !== "010C" && liveDef(p) && !liveDef(p)!.text);
  return (
    <>
      {Array.from({ length: DRIVE_EXTRAS_MAX }, (_, i) => (
        <Field key={i} label={`Drive layout value ${i + 1}`}>
          <Select
            value={extras[i] ?? ""}
            onChange={(e) => {
              const next = [...extras];
              next[i] = e.currentTarget.value;
              setExtras(next.filter(Boolean));
            }}
          >
            <option value="">None</option>
            {options.map((p) => (
              <option key={p} value={p}>
                {liveDef(p)!.name}
              </option>
            ))}
          </Select>
        </Field>
      ))}
    </>
  );
}

"use client";

import { useState } from "react";
import { captureInUse, exportProfiles, matchProfile, parseProfiles, toOverrides, toProfile, upsertProfiles } from "@/lib/connect/profiles";
import { download } from "@/lib/diagnostics/report";
import { useSetting } from "@/lib/storage/settings";
import { useConnection } from "@/lib/store/connection";
import { useAdapterProfiles } from "@/lib/store/settings";
import {
  EMPTY_OVERRIDES,
  loadOverrides,
  saveOverrides,
  WRITE_METHODS,
  type UuidOverrides,
  type WriteMethod,
} from "@/lib/transport/uuidSettings";
import { useMounted } from "./hooks";

const FIELDS: { key: "service" | "notify" | "write"; label: string; hint: string }[] = [
  { key: "service", label: "Service UUID", hint: "e.g. fff0, or a full 128-bit UUID" },
  { key: "notify", label: "Notify characteristic", hint: "e.g. fff1" },
  { key: "write", label: "Write characteristic", hint: "e.g. fff2" },
];

const METHOD_LABEL: Record<WriteMethod, string> = {
  auto: "Auto (prefer without response)",
  "with-response": "With response",
  "without-response": "Without response",
};

const BTN = "min-h-11 rounded-md border border-zinc-600 px-4 text-sm font-medium hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40";
const INPUT = "mt-1 block min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm";
const CUSTOM = "__custom";

export function UuidSettings() {
  const mounted = useMounted();
  const [stored] = useSetting<unknown>("ble.uuids", null);
  return (
    <details id="uuid-settings" className="rounded-lg border border-zinc-800 bg-zinc-900">
      <summary className="min-h-11 cursor-pointer select-none px-4 py-3 font-semibold">Settings: adapter profiles and Bluetooth UUIDs</summary>
      {/* Settings load in the browser (and settings.json later still), so the form renders after hydration and
          starts over when the stored value changes. */}
      {mounted && <ProfileEditor key={JSON.stringify(stored)} />}
    </details>
  );
}

function ProfileEditor() {
  const [profiles, setProfiles] = useAdapterProfiles();
  const [values, setValues] = useState(loadOverrides);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const { gatt, selected, writeMethod, mode } = useConnection();

  const active = loadOverrides();
  const current = matchProfile(profiles, active);
  const isAuto = JSON.stringify(active) === JSON.stringify(EMPTY_OVERRIDES);
  const working = mode === "ble" ? captureInUse(gatt, selected, writeMethod) : null;

  const edit = (o: UuidOverrides) => {
    setValues(o);
    setNote("");
  };
  const apply = (o: UuidOverrides, msg: string) => {
    saveOverrides(o);
    setNote(msg); // the stored value changes, which remounts this editor; the note is for the no-change case
  };

  const pick = (v: string) => {
    if (v === CUSTOM) return;
    const p = profiles.find((x) => x.name === v);
    apply(p ? toOverrides(p) : EMPTY_OVERRIDES, "");
  };

  const saveProfile = () => {
    const n = name.trim();
    if (!n) return setNote("Give the profile a name first.");
    setProfiles(upsertProfiles(profiles, [toProfile(n, values)]));
    saveOverrides(values);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const { profiles: incoming, errors } = parseProfiles(await file.text());
    if (incoming.length) setProfiles(upsertProfiles(profiles, incoming));
    setNote([incoming.length ? `Imported ${incoming.length} profile${incoming.length > 1 ? "s" : ""}.` : "Nothing imported.", ...errors].join(" "));
  };

  return (
    <div className="space-y-4 px-4 pb-4">
      <p className="text-sm text-zinc-400">
        A profile is a saved set of Bluetooth settings: service, notify and write UUIDs and the write method. Pick one before you
        connect. Leave the UUIDs blank to auto-pick the first notify and write characteristics. The debug console lists what your
        adapter exposes. Changes apply on the next Connect.
      </p>

      <label className="block text-sm">
        <span className="text-zinc-300">Profile in use</span>
        <select value={current?.name ?? (isAuto ? "" : CUSTOM)} onChange={(e) => pick(e.target.value)} className={INPUT}>
          <option value="">Auto-pick (no profile)</option>
          {!current && !isAuto && <option value={CUSTOM}>Custom settings (not saved as a profile)</option>}
          {profiles.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <form
        className="space-y-3 rounded-md border border-zinc-800 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          apply(values, "Saved. Applies on the next Connect.");
        }}
      >
        <h3 className="font-semibold">Edit profile</h3>
        {working && (
          <button type="button" className={BTN} onClick={() => edit(working)}>
            Copy the working settings into the form
          </button>
        )}
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="text-zinc-300">{f.label}</span>
            <input
              value={values[f.key]}
              onChange={(e) => edit({ ...values, [f.key]: e.target.value })}
              placeholder={f.hint}
              spellCheck={false}
              autoComplete="off"
              className={`${INPUT} font-mono`}
            />
          </label>
        ))}
        <label className="block text-sm">
          <span className="text-zinc-300">Write method</span>
          <select value={values.writeMethod} onChange={(e) => edit({ ...values, writeMethod: e.target.value as WriteMethod })} className={INPUT}>
            {WRITE_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button className="min-h-11 rounded-md bg-sky-600 px-4 text-sm font-semibold hover:bg-sky-500">Save</button>
          <button type="button" onClick={() => apply(EMPTY_OVERRIDES, "")} className="min-h-11 px-2 text-sm text-zinc-400 underline">
            Reset to auto
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t border-zinc-800 pt-3">
          <label className="block min-w-0 flex-1 text-sm">
            <span className="text-zinc-300">Save these settings as a profile</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Profile name"
              autoComplete="off"
              className={INPUT}
              aria-label="Profile name"
            />
          </label>
          <button type="button" onClick={saveProfile} className={BTN}>
            Save profile
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!current}
          onClick={() => setProfiles(profiles.filter((p) => p.name !== current?.name))}
          className={BTN}
        >
          Delete this profile
        </button>
        <button
          type="button"
          disabled={!profiles.length}
          onClick={() => download("obd-dash-adapter-profiles.json", exportProfiles(profiles), "application/json")}
          className={BTN}
        >
          Export profiles
        </button>
        <label className={`${BTN} flex cursor-pointer items-center`}>
          Import profiles
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(e) => {
              void importFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p aria-live="polite" className="text-sm text-emerald-300">
        {note}
      </p>
    </div>
  );
}

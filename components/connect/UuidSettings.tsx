"use client";

import { useState } from "react";
import { useSetting } from "@/lib/storage/settings";
import { EMPTY_OVERRIDES, loadOverrides, saveOverrides, type UuidOverrides } from "@/lib/transport/uuidSettings";
import { useMounted } from "./hooks";

const FIELDS: { key: keyof UuidOverrides; label: string; hint: string }[] = [
  { key: "service", label: "Service UUID", hint: "e.g. fff0, or a full 128-bit UUID" },
  { key: "notify", label: "Notify characteristic", hint: "e.g. fff1" },
  { key: "write", label: "Write characteristic", hint: "e.g. fff2" },
];

export function UuidSettings() {
  const mounted = useMounted();
  const [stored] = useSetting<unknown>("ble.uuids", null);
  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900">
      <summary className="cursor-pointer select-none px-4 py-3 font-semibold">Settings: Bluetooth UUIDs</summary>
      {/* Settings load in the browser (and settings.json later still), so the form renders after hydration and
          starts over when the stored value changes. */}
      {mounted && <UuidForm key={JSON.stringify(stored)} />}
    </details>
  );
}

function UuidForm() {
  const [values, setValues] = useState(loadOverrides);
  const [saved, setSaved] = useState(false);

  const update = (o: UuidOverrides) => {
    setValues(o);
    setSaved(false);
  };

  return (
    <form
      className="space-y-3 px-4 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        saveOverrides(values);
        setSaved(true);
      }}
    >
      <p className="text-sm text-zinc-400">
        Leave blank to auto-pick the first notify and write characteristics. Set these if auto-pick chooses the wrong
        ones; the debug console lists what your adapter exposes. Applies on the next Connect.
      </p>
      {FIELDS.map((f) => (
        <label key={f.key} className="block text-sm">
          <span className="text-zinc-300">{f.label}</span>
          <input
            value={values[f.key]}
            onChange={(e) => update({ ...values, [f.key]: e.target.value })}
            placeholder={f.hint}
            spellCheck={false}
            autoComplete="off"
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm"
          />
        </label>
      ))}
      <div className="flex items-center gap-3">
        <button className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold hover:bg-sky-500">Save</button>
        <button
          type="button"
          onClick={() => {
            update(EMPTY_OVERRIDES);
            saveOverrides(EMPTY_OVERRIDES);
            setSaved(true);
          }}
          className="text-sm text-zinc-400 underline"
        >
          Reset to auto
        </button>
        {saved && <span className="text-sm text-emerald-300">Saved</span>}
      </div>
    </form>
  );
}

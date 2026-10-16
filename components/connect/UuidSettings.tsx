"use client";

import { useState } from "react";
import { Button, buttonClass, cx, Disclosure, Field, Input, Select } from "@/components/ui";
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

const CUSTOM = "__custom";

export function UuidSettings() {
  const mounted = useMounted();
  const [stored] = useSetting<unknown>("ble.uuids", null);
  return (
    <Disclosure id="uuid-settings" summary="Settings: adapter profiles and Bluetooth UUIDs">
      {/* Settings load in the browser (and settings.json later still), so the form renders after hydration and
          starts over when the stored value changes. */}
      {mounted && <ProfileEditor key={JSON.stringify(stored)} />}
    </Disclosure>
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
    <div className="space-y-4">
      <p className="text-fg-muted">
        A profile is a saved set of Bluetooth settings: service, notify and write UUIDs and the write method. Pick one before you
        connect. Leave the UUIDs blank to auto-pick the first notify and write characteristics. The debug console lists what your
        adapter exposes. Changes apply on the next Connect.
      </p>

      <Field label="Profile in use">
        <Select name="profile" value={current?.name ?? (isAuto ? "" : CUSTOM)} onChange={(e) => pick(e.target.value)}>
          <option value="">Auto-pick (no profile)</option>
          {!current && !isAuto && <option value={CUSTOM}>Custom settings (not saved as a profile)</option>}
          {profiles.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>

      <form
        className="space-y-3 rounded-control border border-line p-3 sm:p-4"
        onSubmit={(e) => {
          e.preventDefault();
          apply(values, "Saved. Applies on the next Connect.");
        }}
      >
        <h3 className="font-semibold">Edit profile</h3>
        {working && (
          <Button size="sm" onClick={() => edit(working)}>
            Copy the working settings into the form
          </Button>
        )}
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <Input
              name={f.key}
              translate="no"
              value={values[f.key]}
              onChange={(e) => edit({ ...values, [f.key]: e.target.value })}
              placeholder={f.hint}
              spellCheck={false}
              autoComplete="off"
              className="font-mono"
            />
          </Field>
        ))}
        <Field label="Write method">
          <Select name="write-method" value={values.writeMethod} onChange={(e) => edit({ ...values, writeMethod: e.target.value as WriteMethod })}>
            {WRITE_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" size="sm">
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => apply(EMPTY_OVERRIDES, "")}>
            Reset to auto
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <Field label="Save these settings as a profile" className="min-w-0 flex-1">
            <Input name="profile-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Profile name" autoComplete="off" />
          </Field>
          <Button onClick={saveProfile}>Save profile</Button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button variant="danger" size="sm" disabled={!current} onClick={() => confirm(`Delete the profile ${current?.name}?`) && setProfiles(profiles.filter((p) => p.name !== current?.name))}>
          Delete this profile
        </Button>
        <Button
          size="sm"
          disabled={!profiles.length}
          onClick={() => download("obd-dash-adapter-profiles.json", exportProfiles(profiles), "application/json")}
        >
          Export profiles
        </Button>
        {/* The file input is visually hidden, so its focus ring is drawn on the label. */}
        <label className={cx(buttonClass("secondary", "sm"), "cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent")}>
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
      <p aria-live="polite" className="text-sm font-medium text-ok">
        {note}
      </p>
    </div>
  );
}

import { describe, expect, it } from "vitest";
import { getSetting } from "../storage/settings";
import { EMPTY_OVERRIDES, loadOverrides, saveOverrides } from "../transport/uuidSettings";
import {
  captureInUse,
  exportProfiles,
  isValidUuid,
  matchProfile,
  parseProfiles,
  sanitizeProfiles,
  toOverrides,
  toProfile,
  upsertProfiles,
} from "./profiles";

const good = { name: "Car A", service: "fff0", notify: "fff1", write: "fff2", writeMethod: "without-response" } as const;

describe("capture", () => {
  const gatt = [
    { uuid: "0000180a-0000-1000-8000-00805f9b34fb", characteristics: [{ uuid: "00002a29-0000-1000-8000-00805f9b34fb", properties: ["read"] }] },
    {
      uuid: "0000fff0-0000-1000-8000-00805f9b34fb",
      characteristics: [
        { uuid: "0000fff1-0000-1000-8000-00805f9b34fb", properties: ["notify"] },
        { uuid: "0000fff2-0000-1000-8000-00805f9b34fb", properties: ["write"] },
      ],
    },
  ];
  const selected = { notify: "0000fff1-0000-1000-8000-00805f9b34fb", write: "0000fff2-0000-1000-8000-00805f9b34fb" };

  it("takes the service that holds the notify characteristic, and the method in use", () => {
    expect(captureInUse(gatt, selected, "with-response")).toEqual({
      service: "0000fff0-0000-1000-8000-00805f9b34fb",
      notify: selected.notify,
      write: selected.write,
      writeMethod: "with-response",
    });
  });

  it("is null without a connection", () => {
    expect(captureInUse([], null, null)).toBeNull();
    expect(captureInUse([], selected, "with-response")).toBeNull();
  });
});

describe("save, load and apply", () => {
  it("applying a profile gives the transport the same settings through loadOverrides", () => {
    const p = toProfile("  Car A ", { service: "fff0", notify: "fff1", write: "fff2", writeMethod: "with-response" });
    expect(p.name).toBe("Car A");
    saveOverrides(toOverrides(p));
    expect(loadOverrides()).toEqual({ service: "fff0", notify: "fff1", write: "fff2", writeMethod: "with-response" });
    expect(matchProfile([p], loadOverrides())).toBe(p);
  });

  it("matches short and full UUID spellings of the same value", () => {
    const p = { ...good, notify: "0000fff1-0000-1000-8000-00805f9b34fb" };
    expect(matchProfile([p], { ...toOverrides(good), writeMethod: "without-response" })).toBe(p);
    expect(matchProfile([p], EMPTY_OVERRIDES)).toBeUndefined();
  });

  it("loadOverrides still reads settings saved before write methods existed", () => {
    saveOverrides({ service: "ffe0", notify: "ffe1", write: "ffe1" } as never);
    expect(loadOverrides()).toEqual({ service: "ffe0", notify: "ffe1", write: "ffe1", writeMethod: "auto" });
    expect(getSetting("ble.uuids", null)).toBeTruthy();
  });

  it("a profile with the same name is replaced, others are kept", () => {
    const b = { ...good, name: "Car B" };
    expect(upsertProfiles([good, b], [{ ...good, write: "fff3" }]).map((p) => `${p.name}:${p.write}`)).toEqual(["Car B:fff2", "Car A:fff3"]);
  });
});

describe("import validation", () => {
  it("round-trips an export", () => {
    const out = parseProfiles(exportProfiles([good, { ...good, name: "B", service: "" }]));
    expect(out.errors).toEqual([]);
    expect(out.profiles).toHaveLength(2);
    expect(out.profiles[0]).toEqual(good);
  });

  it("accepts a bare list", () => {
    expect(parseProfiles(JSON.stringify([good])).profiles).toEqual([good]);
  });

  it("rejects text that is not JSON, and JSON of the wrong shape", () => {
    expect(parseProfiles("{nope").errors[0]).toMatch(/not valid JSON/);
    expect(parseProfiles('{"a":1}').errors[0]).toMatch(/list of profiles/);
    expect(parseProfiles("null").profiles).toEqual([]);
  });

  it("keeps the valid entries and explains each bad one", () => {
    const { profiles, errors } = parseProfiles(
      JSON.stringify({
        profiles: [
          good,
          { ...good, name: "" },
          { ...good, name: "X", notify: 5 },
          { ...good, name: "Y", write: "not-a-uuid" },
          { ...good, name: "Z", writeMethod: "fast" },
          good,
          "text",
        ],
      }),
    );
    expect(profiles).toEqual([good]);
    expect(errors).toEqual([
      "Entry 2: missing name.",
      "Entry 3: notify must be text.",
      "Entry 4: write is not a UUID.",
      "Entry 5: unknown write method.",
      'Entry 6: name "Car A" appears twice.',
      "Entry 7: not an object.",
    ]);
  });

  it("sanitizeProfiles quietly drops what a hand-edited settings.json got wrong", () => {
    expect(sanitizeProfiles("x")).toEqual([]);
    expect(sanitizeProfiles([good, { name: "bad" }, good])).toEqual([good]);
  });

  it("knows short, 8-digit, prefixed, 128-bit and blank UUIDs", () => {
    for (const ok of ["", "fff1", "0xFFF1", "0000fff1", "49535343-fe7d-4ae5-8fa9-9fafd205e455"]) expect(isValidUuid(ok)).toBe(true);
    for (const bad of ["ff", "fff", "xyz1", "49535343-fe7d-4ae5-8fa9"]) expect(isValidUuid(bad)).toBe(false);
  });
});

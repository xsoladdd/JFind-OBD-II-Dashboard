import { afterEach, describe, expect, it, vi } from "vitest";
import { getCustomLayouts } from "../store/settings";
import { setSetting } from "../storage/settings";
import {
  activeLayout,
  addLayout,
  addWidget,
  deleteLayout,
  duplicateLayout,
  EMPTY_LAYOUTS,
  isFull,
  isTall,
  moveWidget,
  sanitizeLayouts,
  sizeOf,
  STARTER_LAYOUTS,
  removeWidget,
  renameLayout,
  setActive,
  updateWidget,
} from "./layouts";

const pids = (s: ReturnType<typeof addLayout>) => activeLayout(s)!.widgets.map((w) => w.pid);

function sample() {
  let s = addLayout(EMPTY_LAYOUTS, "Daily");
  const id = s.active;
  for (const pid of ["010C", "010D", "0105", "ATRV"]) s = addWidget(s, id, pid, "number");
  return { s, id };
}

describe("custom layouts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("adds layouts and widgets, and makes a new layout active", () => {
    const { s, id } = sample();
    expect(s.active).toBe(id);
    expect(pids(s)).toEqual(["010C", "010D", "0105", "ATRV"]);
    expect(activeLayout(s)!.widgets[0]!.size).toBe("1x1");
  });

  it("sets width (half or full) and height (normal or tall) separately, and changes kind", () => {
    const { s, id } = sample();
    const w = activeLayout(s)!.widgets[0]!;
    expect([isFull("2x1"), isTall("2x1"), isFull("1x2"), isTall("1x2")]).toEqual([true, false, false, true]);
    expect([sizeOf(false, false), sizeOf(true, false), sizeOf(false, true), sizeOf(true, true)]).toEqual(["1x1", "2x1", "1x2", "2x2"]);
    const r = updateWidget(s, id, w.id, { size: sizeOf(!isFull(w.size), isTall(w.size)), kind: "gauge" });
    expect(activeLayout(r)!.widgets[0]).toMatchObject({ size: "2x1", kind: "gauge", pid: "010C" });
  });

  it("reorders (up/down and drag), clamping at the ends", () => {
    const { s, id } = sample();
    expect(pids(moveWidget(s, id, 0, 1))).toEqual(["010D", "010C", "0105", "ATRV"]);
    expect(pids(moveWidget(s, id, 3, 0))).toEqual(["ATRV", "010C", "010D", "0105"]);
    expect(pids(moveWidget(s, id, 0, -1))).toEqual(pids(s)); // already at the top
    expect(pids(moveWidget(s, id, 1, 99))).toEqual(["010C", "0105", "ATRV", "010D"]);
  });

  it("renames, duplicates (fresh widget ids), switches and deletes", () => {
    const { s, id } = sample();
    const renamed = renameLayout(s, id, "Track");
    expect(activeLayout(renamed)!.name).toBe("Track");
    const dup = duplicateLayout(renamed, id, "Track copy");
    expect(dup.layouts).toHaveLength(2);
    expect(activeLayout(dup)!.name).toBe("Track copy");
    expect(pids(dup)).toEqual(pids(s));
    expect(activeLayout(dup)!.widgets[0]!.id).not.toBe(activeLayout(s)!.widgets[0]!.id);
    const back = setActive(dup, id);
    expect(activeLayout(back)!.name).toBe("Track");
    const del = deleteLayout(back, id);
    expect(del.layouts.map((l) => l.name)).toEqual(["Track copy"]);
    expect(del.active).toBe(del.layouts[0]!.id);
    expect(deleteLayout(del, del.active)).toEqual(EMPTY_LAYOUTS);
  });

  it("removes a widget", () => {
    const { s, id } = sample();
    expect(pids(removeWidget(s, id, activeLayout(s)!.widgets[1]!.id))).toEqual(["010C", "0105", "ATRV"]);
  });

  it("round-trips through the settings store, starting from the starter layout", () => {
    expect(getCustomLayouts()).toEqual(STARTER_LAYOUTS); // first run: Custom isn't blank
    const { s, id } = sample();
    const saved = updateWidget(s, id, activeLayout(s)!.widgets[2]!.id, { size: "2x2", kind: "gauge" });
    setSetting("dashboard.customLayouts", saved);
    expect(getCustomLayouts()).toEqual(saved);
    expect(getCustomLayouts()).toBe(getCustomLayouts());
    setSetting("dashboard.customLayouts", "hand-edited nonsense"); // settings.json is user-editable
    expect(getCustomLayouts()).toBe(EMPTY_LAYOUTS);
  });

  it("repairs saved layouts instead of dropping them, keeping old sizes as they are", () => {
    const old = {
      active: "l1",
      layouts: [
        { id: "l1", name: "Daily", widgets: [{ id: "a", pid: "010C", kind: "gauge", size: "2x2" }, { id: "b", pid: "010D", kind: "number", size: "2x1" }] },
        { name: 7, widgets: [{ pid: "0105", kind: "dial", size: "3x3" }, { kind: "bar" }, null] },
        "junk",
      ],
    };
    const fixed = sanitizeLayouts(old);
    expect(fixed.active).toBe("l1");
    expect(fixed.layouts[0]).toEqual(old.layouts[0]);
    expect(fixed.layouts[1]).toMatchObject({ name: "Layout", widgets: [{ pid: "0105", kind: "number", size: "1x1" }] });
    expect(fixed.layouts[1]!.id).toEqual(expect.any(String));
    expect(fixed.layouts).toHaveLength(2);
  });
});

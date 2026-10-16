import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeDir, type FakeFile } from "./fakeFs";

const enc = new TextEncoder();
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

/** Fresh module state (folder, settings, connection) for every test. */
async function boot(root?: FakeDir) {
  vi.resetModules();
  if (root) vi.stubGlobal("showDirectoryPicker", async () => root);
  const folder = await import("./folder");
  const settings = await import("./settings");
  await folder.initFolder();
  return { folder, settings };
}

async function linked(root = new FakeDir("OBD Dash")) {
  const m = await boot(root);
  await m.folder.useFolder.getState().link();
  await tick(); // settings.json load + write
  return { ...m, root };
}

afterEach(() => vi.unstubAllGlobals());

describe("checkPath", () => {
  it("rejects traversal, absolute paths, odd characters and anything outside the allowed entries", async () => {
    const { folder } = await boot();
    for (const bad of [
      "..",
      ".",
      "../settings.json",
      "scans/../settings.json",
      "scans/..",
      "/settings.json",
      "/etc/passwd",
      "C:\\x",
      "scans\\x.json",
      "scans/a/b.json",
      "scans/.hidden",
      "scans/a b.json",
      "scans/ü.json",
      "scans/",
      "notes.txt",
      "Settings.json",
      "photos/x.jpg",
      "",
    ])
      expect(() => folder.checkPath(bad), bad).toThrow(/unsafe/);
    for (const ok of [
      "settings.json",
      "settings-broken-2026-10-16T12-00-00Z.json",
      "scans/2026-10-16T12-00-00Z_1HGCM82633A004352.json",
      "scans/2026-10-16T12-00-00Z_NOVIN.json",
      "logs/2026-10-16T12-00-00Z_demo.log",
      "trips/2026-10-16T12-00-00Z_NOVIN.csv",
    ])
      expect(folder.checkPath(ok), ok).toEqual(ok.split("/"));
  });
});

describe("folder files", () => {
  it("writes, reads, lists, appends and removes", async () => {
    const { folder, root } = await linked();
    expect(folder.useFolder.getState()).toMatchObject({ status: "ready", folderName: "OBD Dash" });
    await folder.writeText("scans/a.json", "{}");
    await folder.writeText("scans/a.json", '{"x":1}'); // overwrite
    expect(await folder.readText("scans/a.json")).toBe('{"x":1}');
    expect(await folder.readText("scans/missing.json")).toBeNull();
    expect(await folder.readText("logs/none.log")).toBeNull(); // folder doesn't exist yet
    expect(await folder.listFiles("logs")).toEqual([]);

    await folder.appendText("logs/x.log", "one ␍\n");
    await folder.appendText("logs/x.log", "two\n");
    expect(await folder.readText("logs/x.log")).toBe("one ␍\ntwo\n");

    root.seed("scans/.DS_Store", "junk");
    expect((await folder.listFiles("scans")).map((f) => f.name)).toEqual(["a.json"]);
    expect((await folder.listFiles("logs"))[0]).toMatchObject({ name: "x.log", size: enc.encode("one ␍\ntwo\n").length });

    await folder.removeFile("scans/a.json");
    expect(await folder.listFiles("scans")).toEqual([]);
    await expect(folder.removeFile("settings.json")).rejects.toThrow();
    await expect(folder.writeText("notes.txt", "x")).rejects.toThrow(/unsafe/);
    await expect(folder.listFiles("..")).rejects.toThrow(/unsafe/);
  });

  it("is unsupported without showDirectoryPicker, and settings still work in memory", async () => {
    const { folder, settings } = await boot();
    expect(folder.useFolder.getState().status).toBe("unsupported");
    await expect(folder.writeText("settings.json", "{}")).rejects.toBeInstanceOf(folder.FolderUnavailableError);
    await expect(folder.readText("settings.json")).rejects.toBeInstanceOf(folder.FolderUnavailableError);
    settings.setSetting("units", "imperial");
    expect(settings.getSetting("units", "metric")).toBe("imperial");
  });

  it("needs permission until it is granted again", async () => {
    const root = new FakeDir("Car", { query: "prompt", request: "denied" });
    const { folder } = await boot(root);
    expect(folder.useFolder.getState().status).toBe("unlinked");
    await folder.useFolder.getState().link();
    expect(folder.useFolder.getState()).toMatchObject({ status: "needs-permission", folderName: "Car" });
    await expect(folder.appendText("logs/x.log", "x")).rejects.toBeInstanceOf(folder.FolderUnavailableError);

    root.perm.request = "granted";
    await folder.useFolder.getState().regrant();
    expect(folder.useFolder.getState().status).toBe("ready");
    await folder.appendText("logs/x.log", "x");
    expect(root.file("logs/x.log")?.data).toBe("x");

    await folder.useFolder.getState().unlink();
    expect(folder.useFolder.getState()).toMatchObject({ status: "unlinked", folderName: null });
    expect(root.file("logs/x.log")?.data).toBe("x"); // forgetting the folder deletes nothing
  });
});

describe("settings lifecycle", () => {
  it("keeps settings in memory, then writes them once a folder is linked", async () => {
    const root = new FakeDir("OBD Dash");
    const { folder, settings } = await boot(root);
    settings.setSetting("units", "imperial");
    expect(root.file("settings.json")).toBeUndefined();
    await folder.useFolder.getState().link();
    await tick();
    expect(JSON.parse(root.file("settings.json")!.data)).toEqual({ units: "imperial" });

    settings.setSetting("dashboard.theme", "hud");
    await tick(600); // debounced write
    expect(JSON.parse(root.file("settings.json")!.data)).toEqual({ units: "imperial", "dashboard.theme": "hud" });
  });

  it("lets the file win over memory", async () => {
    const root = new FakeDir("OBD Dash").seed("settings.json", '{"units":"metric","dashboard.redlineRpm":7000}');
    const { folder, settings } = await boot(root);
    settings.setSetting("units", "imperial");
    settings.setSetting("dashboard.hudMirror", true);
    await folder.useFolder.getState().link();
    await tick();
    expect(settings.getSetting("units", "x")).toBe("metric");
    expect(JSON.parse(root.file("settings.json")!.data)).toEqual({
      units: "metric",
      "dashboard.redlineRpm": 7000,
      "dashboard.hudMirror": true,
    });
  });

  it("returns the same object until the value changes (stable useSyncExternalStore snapshots)", async () => {
    const { settings } = await boot();
    settings.setSetting("x.list", [1, 2]);
    const a = settings.getSetting<number[]>("x.list", []);
    expect(settings.getSetting<number[]>("x.list", [])).toBe(a);
    settings.setSetting("x.list", [1, 2, 3]);
    expect(settings.getSetting<number[]>("x.list", [])).toEqual([1, 2, 3]);
  });

  it("migrates the old localStorage keys into settings.json, then removes them", async () => {
    const ls = new Map<string, string>([
      ["obd-dash.uuids", '{"service":"fff0","notify":"fff1","write":"fff2"}'],
      ["obd-dash.garage.active", "car-1"],
      ["obd-dash.setting.units", '"imperial"'],
      ["obd-dash.setting.alerts.rules", '[{"id":"r1"}]'],
      ["obd-dash.setting.dashboard.customLayouts", '{"active":"l1","layouts":[]}'],
      ["obd-dash.setting.dashboard.theme", "{corrupt"],
      ["unrelated", "keep"],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => ls.get(k) ?? null,
      removeItem: (k: string) => void ls.delete(k),
    });
    const root = new FakeDir("OBD Dash");
    const { folder, settings } = await boot(root);
    expect(settings.getSetting("garage.activeId", null)).toBe("car-1"); // works before any folder is linked
    await folder.useFolder.getState().link();
    await tick();
    expect(JSON.parse(root.file("settings.json")!.data)).toEqual({
      "ble.uuids": { service: "fff0", notify: "fff1", write: "fff2" },
      "garage.activeId": "car-1",
      units: "imperial",
      "alerts.rules": [{ id: "r1" }],
      "dashboard.customLayouts": { active: "l1", layouts: [] },
    });
    expect([...ls.keys()]).toEqual(["unrelated"]);
  });

  it("keeps a malformed settings.json, warns and uses defaults", async () => {
    const root = new FakeDir("OBD Dash").seed("settings.json", '{"units": "imperial",');
    const { folder, settings } = await linked(root);
    expect(settings.getSetting("units", "metric")).toBe("metric");
    expect(settings.useSettingsWarning.getState().warning).toMatch(/settings-broken-.*\.json/);
    const backup = [...root.entries.keys()].find((n) => n.startsWith("settings-broken-"))!;
    expect(root.file(backup)!.data).toBe('{"units": "imperial",');
    expect(JSON.parse(root.file("settings.json")!.data)).toEqual({});
    expect(folder.useFolder.getState().status).toBe("ready");
  });

  it("treats a JSON value that isn't an object as malformed", async () => {
    const root = new FakeDir("OBD Dash").seed("settings.json", "[1,2]");
    const { settings } = await linked(root);
    expect(settings.useSettingsWarning.getState().warning).toMatch(/not a JSON object/);
  });
});

describe("debug logs", () => {
  async function recorder() {
    const m = await linked();
    const conn = await import("../store/connection");
    const logs = await import("./logs");
    return { ...m, conn, logs, stop: logs.startLogRecorder() };
  }
  const logFiles = (root: FakeDir) => [...((root.entries.get("logs") as FakeDir | undefined)?.entries.values() ?? [])] as FakeFile[];

  it("records a Demo session through the simulator, with CR/LF made visible", async () => {
    const { conn, root, stop } = await recorder();
    await conn.useConnection.getState().connect("demo");
    await conn.useConnection.getState().sendRaw("010C");
    await conn.useConnection.getState().disconnect();
    stop(); // flushes the late "disconnected" line, which otherwise waits for the 5 s timer
    await tick();
    const files = logFiles(root);
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toMatch(/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ_demo\.log$/);
    const text = files[0]!.data;
    expect(text).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z tx ATZ$/m);
    expect(text).toContain("␍");
    expect(text).toMatch(/ info disconnected$/m);
    expect(text.split("\n").every((l) => !l.includes("\r"))).toBe(true);
  });

  it("flushes on a timer while connected, without waiting for disconnect", async () => {
    const { conn, root, stop } = await recorder();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      conn.useConnection.setState({ status: "connecting", mode: "ble" });
      conn.useConnection.setState({ log: [{ dir: "tx", text: "ATZ", t: Date.now(), id: 1 }] });
      expect(logFiles(root)).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(5000);
    } finally {
      vi.useRealTimers();
    }
    await tick();
    expect(logFiles(root)[0]!.name).toMatch(/_ble\.log$/);
    expect(logFiles(root)[0]!.data).toMatch(/ tx ATZ\n$/);
    stop();
  });

  it("starts a new file past the cap", async () => {
    const { conn, logs, root, stop } = await recorder();
    const big = "x".repeat(Math.floor(logs.LOG_CAP * 0.45));
    const t0 = Date.UTC(2026, 9, 16, 12, 0, 0);
    conn.useConnection.setState({ status: "connecting", mode: "demo" });
    conn.useConnection.setState({
      log: [1, 2, 3].map((id) => ({ dir: "rx" as const, text: big, t: t0 + id * 60_000, id })),
    });
    conn.useConnection.setState({ status: "idle" });
    await tick(100);
    const files = logFiles(root).sort((a, b) => a.name.localeCompare(b.name));
    expect(files.map((f) => f.data.split("\n").length - 1)).toEqual([2, 1]);
    expect(files[1]!.name).toBe("2026-10-16T12-03-00Z_demo.log"); // named after its first line
    expect(files.every((f) => enc.encode(f.data).length <= logs.LOG_CAP)).toBe(true);
    stop();
  });
});

describe("history", () => {
  it("lists scans by their header fields, newest first, and flags unreadable ones", async () => {
    const head = (takenAt: string, vin: string | null, kind: string) =>
      JSON.stringify({ format: "obd-dash-scan", version: 1, takenAt, vin, kind, codes: [] });
    const root = new FakeDir("OBD Dash")
      .seed("scans/2026-10-01T08-00-00Z_NOVIN.json", head("2026-10-01T08:00:00.000Z", null, "read"))
      .seed("scans/2026-10-15T09-00-00Z_1HGCM82633A004352.json", head("2026-10-15T09:00:00.000Z", "1HGCM82633A004352", "clear"))
      .seed("scans/broken.json", "nope")
      .seed("scans/readme.txt", "not a scan");
    await linked(root);
    const { listScans } = await import("./history");
    expect(await listScans()).toEqual([
      expect.objectContaining({ takenAt: "2026-10-15T09:00:00.000Z", vin: "1HGCM82633A004352", kind: "clear" }),
      expect.objectContaining({ takenAt: "2026-10-01T08:00:00.000Z", vin: null, kind: "read" }),
      { name: "broken.json", size: 4, takenAt: null, vin: null, kind: null },
    ]);
  });
});

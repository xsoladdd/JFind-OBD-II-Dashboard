import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDir } from "../storage/fakeFs";
import { useFolder } from "../storage/folder";
import { parseSummary, parseTripCsv } from "../trips/format";
import { useConnection } from "./connection";
import { useLive } from "./live";
import { removeSavedTrip, startTripWatcher, useTrips } from "./trips";

describe("trip recorder", () => {
  let stop: () => void;
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 16, 8, 0, 0) });
    useLive.getState().reset();
    useTrips.setState({ current: null, last: null, saved: null });
    useLive.setState({ supported: ["010D", "010C", "015E"] });
    useConnection.setState({ status: "connected" });
    stop = startTripWatcher();
  });
  afterEach(async () => {
    stop();
    useConnection.setState({ status: "idle" });
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 0)); // let this test's queued writes finish before the folder goes
    await useFolder.getState().unlink();
    vi.unstubAllGlobals();
  });

  const link = async (root: FakeDir) => {
    vi.stubGlobal("showDirectoryPicker", async () => root);
    await useFolder.getState().link();
  };

  /** One reading of each PID per 100 ms for `secs`, at `kmh`. */
  const drive = (secs: number, kmh: number) => {
    for (let i = 0; i < secs * 10; i++) {
      vi.advanceTimersByTime(100);
      const t = Date.now();
      useLive.getState().record("010D", kmh, t);
      useLive.getState().record("010C", 900 + kmh * 25, t);
      useLive.getState().record("015E", kmh ? 6 : 0.8, t);
    }
  };

  it("starts on movement, integrates, and ends with a summary + CSV on disconnect", () => {
    drive(2, 0);
    expect(useTrips.getState().current).toBeNull();
    drive(36, 100); // 1 km
    const cur = useTrips.getState().current!;
    expect(cur).not.toBeNull();
    expect(cur.stats.distanceKm).toBeCloseTo(1, 1);
    expect(cur.stats.fuelSource).toBe("015E");
    useConnection.setState({ status: "idle" });
    const last = useTrips.getState().last!;
    expect(useTrips.getState().current).toBeNull();
    expect(last.base).toBe("2026-10-16T08-00-02Z_NOVIN");
    expect(last.summary.endedAt).not.toBeNull();
    const d = parseTripCsv(last.csv);
    expect(Object.keys(d.cols)).toEqual(["010D", "010C", "015E"]);
    expect(d.t.length).toBeGreaterThanOrEqual(35);
    expect(d.cols["010D"]!.at(-1)).toBe(100);
  });

  it("ends after the stop timeout while still connected", () => {
    drive(5, 50);
    expect(useTrips.getState().current).not.toBeNull();
    drive(5 * 60 + 1, 0); // default timeout: 5 min stopped
    expect(useTrips.getState().current).toBeNull();
    expect(useTrips.getState().last?.summary.idleMs).toBeGreaterThan(299_000);
  });

  it("saves the summary at the start, streams the CSV every few seconds, and finalises on stop", async () => {
    const root = new FakeDir("OBD Dash");
    await link(root);
    drive(1, 0);
    drive(3, 60);
    await vi.advanceTimersByTimeAsync(0);
    const base = "2026-10-16T08-00-01Z_NOVIN";
    expect(parseSummary(root.file(`trips/${base}.json`)!.data)?.endedAt).toBeNull(); // listed even if the app dies now
    drive(8, 60);
    await vi.advanceTimersByTimeAsync(0);
    const rowsSoFar = parseTripCsv(root.file(`trips/${base}.csv`)!.data).t.length;
    expect(rowsSoFar).toBeGreaterThanOrEqual(3); // flushed while still driving
    useConnection.setState({ status: "idle" });
    await vi.advanceTimersByTimeAsync(0);
    const summary = parseSummary(root.file(`trips/${base}.json`)!.data)!;
    expect(summary.endedAt).not.toBeNull();
    expect(summary.distanceKm).toBeCloseTo((60 * 11) / 3600, 1);
    expect(root.file(`trips/${base}.csv`)!.data).toBe(useTrips.getState().last!.csv); // nothing lost, nothing doubled
    expect(useTrips.getState().last?.saved).toBe(true);
    expect(useTrips.getState().saved?.map((t) => t.base)).toEqual([base]);

    await removeSavedTrip(base);
    expect(root.file(`trips/${base}.json`)).toBeUndefined();
    expect(root.file(`trips/${base}.csv`)).toBeUndefined();
    expect(useTrips.getState().saved).toEqual([]);
  });

  it("keeps a trip in memory without a folder and writes it once one is chosen", async () => {
    drive(1, 0);
    drive(5, 40);
    useConnection.setState({ status: "idle" });
    await vi.advanceTimersByTimeAsync(0);
    expect(useTrips.getState().last?.saved).toBe(false);
    const root = new FakeDir("OBD Dash");
    await link(root);
    await vi.advanceTimersByTimeAsync(0);
    const base = useTrips.getState().last!.base;
    expect(root.file(`trips/${base}.csv`)!.data).toBe(useTrips.getState().last!.csv);
    expect(useTrips.getState().last?.saved).toBe(true);
  });
});

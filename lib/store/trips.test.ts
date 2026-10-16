import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTripCsv } from "../trips/format";
import { useConnection } from "./connection";
import { useLive } from "./live";
import { startTripWatcher, useTrips } from "./trips";

describe("trip recorder", () => {
  let stop: () => void;
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 16, 8, 0, 0) });
    useLive.getState().reset();
    useLive.setState({ supported: ["010D", "010C", "015E"] });
    useConnection.setState({ status: "connected" });
    stop = startTripWatcher();
  });
  afterEach(() => {
    stop();
    useConnection.setState({ status: "idle" });
    vi.useRealTimers();
  });

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
});

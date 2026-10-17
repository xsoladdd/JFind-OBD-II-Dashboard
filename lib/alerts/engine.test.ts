import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAlerts } from "../store/alerts";
import { useLive } from "../store/live";
import { stopAlertEngine, syncAlertEngine } from "./engine";
import type { AlertRule } from "./rules";

const polling = vi.hoisted(() => ({ held: 0, acquires: 0 }));
vi.mock("../polling", () => ({
  acquirePolling: () => {
    polling.held++;
    polling.acquires++;
    let done = false;
    return () => {
      if (!done) polling.held--;
      done = true;
    };
  },
}));

const rpm: AlertRule = { id: "rpm", pid: "010C", op: "above", threshold: 6000, hysteresis: 500, durationS: 1, enabled: true };
const volts: AlertRule = { id: "v", pid: "ATRV", op: "below", threshold: 12, hysteresis: 0.3, durationS: 0, enabled: false };

describe("alert engine", () => {
  const notify = vi.fn();
  beforeEach(() => {
    notify.mockReset();
    polling.held = polling.acquires = 0;
    useLive.getState().reset();
    useAlerts.setState({ active: [], mutedUntil: 0 });
  });
  afterEach(() => stopAlertEngine());

  it("holds polling only while connected with an enabled rule, and releases on disconnect", () => {
    syncAlertEngine([volts], true, notify);
    expect(polling.held).toBe(0); // only a disabled rule
    syncAlertEngine([rpm, volts], true, notify);
    expect(polling.held).toBe(1);
    syncAlertEngine([{ ...rpm, threshold: 5000 }, volts], true, notify); // editing a rule keeps the one hold
    expect(polling).toEqual({ held: 1, acquires: 1 });
    syncAlertEngine([rpm], false, notify); // disconnected
    expect(polling.held).toBe(0);
    useLive.getState().record("010C", 7000, 0);
    useLive.getState().record("010C", 7000, 2000);
    expect(notify).not.toHaveBeenCalled(); // no longer listening
  });

  it("fires after the duration, shows the active alert, and clears past the hysteresis", () => {
    syncAlertEngine([rpm], true, notify);
    const rec = (v: number, t: number) => useLive.getState().record("010C", v, t);
    rec(7000, 0);
    expect(notify).not.toHaveBeenCalled();
    rec(7000, 1000);
    expect(notify).toHaveBeenCalledWith(rpm, 7000);
    expect(useAlerts.getState().active.map((a) => a.rule.id)).toEqual(["rpm"]);
    rec(5800, 1100); // inside the hysteresis band: still active
    expect(useAlerts.getState().active).toHaveLength(1);
    useAlerts.getState().ackAll();
    expect(useAlerts.getState().active[0]!.acked).toBe(true);
    rec(5400, 1200);
    expect(useAlerts.getState().active).toHaveLength(0);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("stays silent while muted but still shows the alert", () => {
    syncAlertEngine([{ ...rpm, durationS: 0 }], true, notify);
    useAlerts.setState({ mutedUntil: 10_000 });
    useLive.getState().record("010C", 7000, 5000);
    expect(notify).not.toHaveBeenCalled();
    expect(useAlerts.getState().active).toHaveLength(1);
    useLive.getState().record("010C", 1000, 6000);
    useLive.getState().record("010C", 7000, 11_000); // mute expired
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("drops the active alert when its rule is disabled", () => {
    syncAlertEngine([{ ...rpm, durationS: 0 }], true, notify);
    useLive.getState().record("010C", 7000, 0);
    expect(useAlerts.getState().active).toHaveLength(1);
    syncAlertEngine([{ ...rpm, durationS: 0, enabled: false }], true, notify);
    expect(useAlerts.getState().active).toHaveLength(0);
    expect(polling.held).toBe(0);
  });
});

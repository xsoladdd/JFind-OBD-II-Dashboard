import { useEffect } from "react";
import type { ElmClient } from "../elm/ElmClient";
import { getClient, useConnection } from "../store/connection";
import { ATRV, useLive } from "../store/live";
import { getCustomPids } from "../store/settings";
import { subscribeSettings } from "../storage/settings";
import { toast } from "../store/toasts";
import { addRefs, Scheduler } from "./Scheduler";

/*
 * The app's one Scheduler. It runs while the connection is up AND at least one consumer wants live data,
 * so pages that don't need it (the connect screen's debug log) aren't flooded with polling traffic.
 */
let consumers = 0;
let current: { client: ElmClient; scheduler: Scheduler; hzTimer: ReturnType<typeof setInterval> } | null = null;
let lastClient: ElmClient | null = null;
let unsubConnection: (() => void) | null = null;
let unsubCustom: (() => void) | null = null;
let lastCustom = getCustomPids();
const fast = new Map<string, number>();

function sync() {
  const client = getClient();
  const want = consumers > 0 && useConnection.getState().status === "connected" && !!client?.isOpen;
  if (current && (!want || current.client !== client)) stopCurrent();
  if (want && !current && client) startOn(client);
}

function startOn(client: ElmClient) {
  if (client !== lastClient) useLive.getState().reset(); // a new connection starts a fresh session
  lastClient = client;
  const scheduler = new Scheduler(client, {
    fast,
    custom: (lastCustom = getCustomPids()),
    protocol: useConnection.getState().protocol,
    onSupported: (ids) => useLive.setState({ supported: ids }),
    onValue: (id, v, t) => {
      useLive.getState().record(id, v, t);
      if (id === ATRV.id) useConnection.setState({ voltage: `${v.toFixed(1)}V` });
    },
    onWarning: (text) => toast.warn(text),
  });
  const hzTimer = setInterval(() => useLive.setState({ hz: scheduler.hz }), 1000);
  current = { client, scheduler, hzTimer };
  useLive.setState({ running: true });
  void scheduler.run().finally(() => {
    if (current?.scheduler === scheduler) stopCurrent();
  });
}

function stopCurrent() {
  if (!current) return;
  current.scheduler.stop();
  clearInterval(current.hzTimer);
  current = null;
  useLive.setState({ running: false, hz: 0 });
}

/** Keeps live polling running until release() is called. */
export function acquirePolling() {
  consumers++;
  unsubConnection ??= useConnection.subscribe(sync);
  // Edited custom PIDs apply to the running Scheduler without a restart.
  unsubCustom ??= subscribeSettings(() => {
    if (getCustomPids() === lastCustom) return;
    lastCustom = getCustomPids();
    current?.scheduler.setCustom(lastCustom);
  });
  sync();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    consumers--;
    sync();
  };
}

/** Polls `ids` at fast priority (and keeps polling running) until release() is called. */
export function requestFast(ids: string[]) {
  const releaseRefs = addRefs(fast, ids);
  const releasePolling = acquirePolling();
  return () => {
    releaseRefs();
    releasePolling();
  };
}

/** React: live polling while the component is mounted, with optional fast-priority PIDs. */
export function usePolling(fastIds: string[] = []) {
  const key = fastIds.join(",");
  useEffect(() => {
    const ids = key ? key.split(",") : [];
    return ids.length ? requestFast(ids) : acquirePolling();
  }, [key]);
}

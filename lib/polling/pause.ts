import { create } from "zustand";

// Shared by any long or state-changing ELM operation (sets) and the Scheduler (reads).
export const usePollingPause = create<{ holds: number }>(() => ({ holds: 0 }));

// The Scheduler's header group in flight (ATSH, requests, restore). The client queue is FIFO, so a command sent
// meanwhile would land inside the group and go out on the custom header.
let group: Promise<unknown> = Promise.resolve();
export const trackPolling = <T>(p: Promise<T>) => ((group = p.catch(() => {})), p);
export const pollingSettled = () => group;

export async function withPollingPaused<T>(fn: () => Promise<T>): Promise<T> {
  usePollingPause.setState((s) => ({ holds: s.holds + 1 }));
  try {
    await pollingSettled(); // the in-flight group finishes, restore included, before fn's first command
    return await fn();
  } finally {
    usePollingPause.setState((s) => ({ holds: s.holds - 1 }));
  }
}

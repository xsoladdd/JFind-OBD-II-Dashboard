"use client";

import { useEffect, useState } from "react";

/** Keeps the screen on while mounted. The browser drops the lock when the tab is hidden, so re-acquire on return. */
export function useWakeLock() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        lock = await navigator.wakeLock.request("screen");
        if (cancelled) return void lock.release();
        setActive(true);
        lock.addEventListener("release", () => setActive(false));
      } catch {
        setActive(false); // denied (battery saver, no user gesture yet, unsupported context)
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, []);
  return active;
}

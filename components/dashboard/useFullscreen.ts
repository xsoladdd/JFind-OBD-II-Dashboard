"use client";

import { useEffect, useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
};
const canFullscreen = () => !!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function";

/**
 * Whole-page full screen for the drive view. Feature-detected: `supported` stays false where the Fullscreen API is
 * missing (iPhone Safari), and the dashboard already fills the window there. Leaving the dashboard exits it.
 */
export function useFullscreen() {
  const supported = useSyncExternalStore(subscribe, canFullscreen, () => false);
  const active = useSyncExternalStore(subscribe, () => !!document.fullscreenElement, () => false);
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    },
    [],
  );
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {}); // denied: stay windowed
  };
  return { supported, active, toggle };
}

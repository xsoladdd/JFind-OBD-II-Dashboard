"use client";

import { useSyncExternalStore } from "react";
import { hasWebBluetooth } from "@/lib/transport/WebBluetoothTransport";

const noSubscribe = () => () => {};

/** True once hydrated on the client; false during SSR and the hydration pass. */
export function useMounted() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

/** Feature-detects Web Bluetooth. Assumes support on the server so the banner never flashes for supported browsers. */
export function useHasBluetooth() {
  return useSyncExternalStore(noSubscribe, hasWebBluetooth, () => true);
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLastAdapter } from "@/lib/store/settings";
import { findKnownAdapter } from "@/lib/transport/knownAdapter";
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

/**
 * The last adapter, when the browser can reconnect to it without the chooser (getDevices, feature-detected).
 * Connecting still waits for a tap: pass `device` to connect("ble", device) from a click handler.
 */
export function useKnownAdapter() {
  const last = useLastAdapter();
  const id = last?.id ?? "";
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  useEffect(() => {
    let live = true;
    void findKnownAdapter(id).then((d) => live && setDevice(d));
    return () => {
      live = false;
    };
  }, [id]);
  return device && { device, name: device.name || last?.name || "adapter" };
}

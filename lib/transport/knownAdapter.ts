import { hasWebBluetooth } from "./WebBluetoothTransport";

/**
 * Reconnect without the device chooser: navigator.bluetooth.getDevices() lists adapters this site was granted before.
 * Support varies by browser and flags (README [verify]), so it is feature-detected; without it Connect shows the chooser.
 */
export const canSkipChooser = () => hasWebBluetooth() && typeof navigator.bluetooth.getDevices === "function";

/** The granted device with this id, or null (unsupported, revoked, or the call failed). */
export async function findKnownAdapter(id: string): Promise<BluetoothDevice | null> {
  if (!id || !canSkipChooser()) return null;
  try {
    return (await navigator.bluetooth.getDevices()).find((d) => d.id === id) ?? null;
  } catch {
    return null;
  }
}

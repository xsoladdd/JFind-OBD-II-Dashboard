import { useConnection, type ConnStatus } from "../store/connection";
import { useLive } from "../store/live";

/**
 * Moving = connected and the last live vehicle speed (010D, km/h) is above 0. No staleness timeout on purpose: a
 * polling pause (an ECU test, a scan) must not unlock forms mid-drive. See DESIGN.md "Driving".
 */
export const isDriving = (status: ConnStatus, speedKmh: number | undefined) => status === "connected" && (speedKmh ?? 0) > 0;

/** True while the car is moving. Lock typing and careful reading with `StoppedOnly` (components/ui). */
export function useDriving(): boolean {
  const status = useConnection((s) => s.status);
  const speed = useLive((s) => s.values["010D"]?.value);
  return isDriving(status, speed);
}

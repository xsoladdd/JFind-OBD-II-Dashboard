import type { ElmErrorCode } from "../elm/ElmClient";
import type { ConnectFailure, ConnStatus } from "../store/connection";

export type StepId = "no-bluetooth" | "chooser" | "gatt" | "characteristics" | "init" | "vehicle" | "disconnects";

export interface Step {
  id: StepId;
  title: string;
  /** Ordered things to try. General ELM327 / Web Bluetooth guidance, not claims about one particular adapter. */
  items: string[];
  links?: ("uuids" | "console")[];
}

export const STEPS: Step[] = [
  {
    id: "no-bluetooth",
    title: "This browser has no Web Bluetooth",
    items: [
      "Use Chrome or Edge on desktop or Android, or the Bluefy browser on iPhone and iPad. Safari, Firefox and other iOS browsers don't support Web Bluetooth.",
      "The page must be served over HTTPS (or be localhost). Web Bluetooth is disabled on plain HTTP.",
      "On some Linux setups Chrome needs Web Bluetooth switched on in chrome://flags.",
      "Demo mode works in any browser while you sort this out.",
    ],
  },
  {
    id: "chooser",
    title: "The device chooser was cancelled, or no device was listed",
    items: [
      "Plug the adapter into the OBD-II port and turn the ignition on. Most adapters are powered from the port, so check for a power light.",
      "Turn Bluetooth on for the phone or computer. Some Android versions also need Location switched on before they will scan.",
      "Close other OBD apps and other devices that may be connected to the adapter. A Bluetooth LE adapter usually accepts one connection at a time.",
      "Tap Connect again and pick the adapter. It may show up unnamed or under a short code. Unplug and replug the adapter to see which entry appears.",
      "If it was listed before but isn't now, remove (forget) it in the system Bluetooth settings, switch Bluetooth off and on, and try again.",
    ],
  },
  {
    id: "gatt",
    title: "The Bluetooth connection failed",
    items: [
      "Move the phone close to the adapter and try again. The first attempt sometimes fails.",
      "Close other apps and browser tabs that are connected to the adapter.",
      "Unplug the adapter for about 10 seconds, plug it back in, and reconnect.",
      "Switch Bluetooth off and on, or remove (forget) the adapter in the system Bluetooth settings.",
      "If it keeps failing, the debug console shows how far the connection got.",
    ],
    links: ["console"],
  },
  {
    id: "characteristics",
    title: "No notify or write characteristic was found",
    items: [
      "Open the debug console and look at the GATT list: it shows every service and characteristic the adapter exposes, with their properties.",
      "Pick a notify characteristic (the adapter's replies come in on it) and a write one (commands go out on it), and enter them, with their service, in the UUID settings. Then connect again.",
      "Web Bluetooth only exposes services the page asked for. If the adapter's service isn't in the list, enter its UUID in the UUID settings. An app like nRF Connect can show it.",
      "Try the other write method in the UUID settings.",
      "Adapters that only support classic Bluetooth (serial profile) can't be reached by Web Bluetooth.",
    ],
    links: ["console", "uuids"],
  },
  {
    id: "init",
    title: "The adapter timed out or answered with garbage",
    items: [
      "Open the debug console. If no ← lines appear after ATZ, the notify characteristic is probably wrong. If they appear but look like noise, the wrong characteristic or write method is a likely cause.",
      "Set the service, notify and write UUIDs explicitly in the UUID settings, and try the other write method.",
      "Unplug the adapter for about 10 seconds, plug it in, and connect again. Some low-cost adapters take a while to start after power-up.",
      "Send ATZ from the debug console. A working adapter answers with a version string like ELM327 followed by a version.",
    ],
    links: ["console", "uuids"],
  },
  {
    id: "vehicle",
    title: "The adapter answers but the car doesn't (UNABLE TO CONNECT, NO DATA, BUS INIT)",
    items: [
      "Turn the ignition on. The engine can stay off, but most cars' engine computers don't answer with the ignition off.",
      "Push the adapter fully into the OBD-II port. If nothing connects on any car, the port's power or fuse may be at fault.",
      "UNABLE TO CONNECT means the adapter found no protocol it could talk. Retry with the ignition on. ATDPN shows which protocol it settled on (A0 means it hasn't found one).",
      "NO DATA means the bus was reached but nothing replied to that request. Retry 0100 from the debug console.",
      "BUS INIT errors come up on older cars that use slow-init protocols. Keep the ignition on, wait a few seconds and retry. If you know your car's protocol, ATSP followed by its number (see the ELM327 datasheet) fixes it instead of auto-detect.",
      "A weak battery can cause failed connections. The voltage reading shows what the adapter sees.",
    ],
    links: ["console"],
  },
  {
    id: "disconnects",
    title: "The adapter keeps disconnecting",
    items: [
      "Keep the phone near the adapter and the page in the foreground with the screen on. Browsers can throttle or drop Bluetooth for background tabs.",
      "Turn off battery saver for the browser. Power-saving modes can cut Bluetooth.",
      "Check the adapter is seated firmly. A loose adapter loses power over bumps.",
      "A voltage dip while cranking can reset an adapter. Connect after the engine has started, or keep the ignition on.",
      "The app retries three times after a drop. After that, tap Connect again. The debug console records every drop.",
    ],
    links: ["console"],
  },
];

/** The cases where a vehicle-side error (not the adapter) is the problem. */
const VEHICLE_ERRORS: ElmErrorCode[] = ["UNABLE_TO_CONNECT", "NO_DATA", "BUS_INIT", "CAN_ERROR"];

export interface PickInput {
  hasBluetooth: boolean;
  mode: "ble" | "demo" | null;
  status: ConnStatus;
  failure: ConnectFailure | null;
  vehicleError: ElmErrorCode | null;
  elmVersion: string;
  log: { dir: string; text: string }[];
}

/** Drops since the last fresh connect (reconnect attempts don't log "transport connected" again). */
export function countDrops(log: PickInput["log"]): number {
  const start = log.map((l) => l.text).lastIndexOf("transport connected");
  return log.slice(start + 1).filter((l) => l.dir === "error" && l.text === "link dropped").length;
}

/** The step that matches where the connection went wrong, or null when nothing has. */
export function pickStep(i: PickInput): StepId | null {
  if (!i.hasBluetooth && i.mode !== "demo") return "no-bluetooth";
  const f = i.failure;
  if (f) {
    if (f.name === "NoCharacteristicError") return "characteristics";
    if (!f.afterTransport) return f.name === "NotFoundError" ? "chooser" : "gatt";
    return f.code === "DISCONNECTED" ? "disconnects" : "init";
  }
  if (countDrops(i.log) >= 2) return "disconnects";
  if (i.vehicleError) return VEHICLE_ERRORS.includes(i.vehicleError) ? "vehicle" : "init";
  // Same test the client uses to find the version line: if none matched, ATZ's answer was unusual.
  if (i.status === "connected" && i.mode === "ble" && !/ELM|v\d/i.test(i.elmVersion)) return "init";
  return null;
}

import type { ElmErrorCode } from "../elm/ElmClient";
import type { GattServiceInfo } from "../transport/WebBluetoothTransport";
import type { UuidOverrides } from "../transport/uuidSettings";
import type { AdapterInfo } from "./adapterInfo";

export const LOG_LINES = 50;

const ARROW = { tx: "→", rx: "←", info: "·", error: "!" } as const;

export interface DiagnosticsInput {
  now: number;
  mode: "ble" | "demo" | null;
  status: string;
  deviceName: string;
  error: string;
  failure: { name: string; code?: string; afterTransport: boolean } | null;
  vehicleError: ElmErrorCode | null;
  info: AdapterInfo | null;
  gatt: GattServiceInfo[];
  selected: { notify: string; write: string } | null;
  writeMethod: string | null;
  overrides: UuidOverrides;
  log: { dir: keyof typeof ARROW; text: string; t: number }[];
}

const show = (s: string) => s.replace(/\r/g, "␍").replace(/\n/g, "␊");
const or = (s: string | null | undefined, dash = "-") => s || dash;

/** Plain text to paste when asking for help: a summary of the connection plus the last LOG_LINES debug lines. */
export function formatDiagnostics(i: DiagnosticsInput): string {
  const o = i.overrides;
  const overrides = [o.service && `service=${o.service}`, o.notify && `notify=${o.notify}`, o.write && `write=${o.write}`, o.writeMethod !== "auto" && `method=${o.writeMethod}`].filter(Boolean);
  const lines = [
    "OBD Dash connection diagnostics",
    `Generated: ${new Date(i.now).toISOString()}`,
    "",
    `Mode: ${or(i.mode)}`,
    `Status: ${i.status}`,
    `Device: ${or(i.deviceName)}`,
    ...(i.error ? [`Error: ${i.error}`] : []),
    ...(i.failure ? [`Failure: ${i.failure.name}${i.failure.code ? ` / ${i.failure.code}` : ""} (${i.failure.afterTransport ? "after" : "before"} the Bluetooth link came up)`] : []),
    ...(i.vehicleError ? [`Vehicle: ${i.vehicleError}`] : []),
    "",
    "Adapter",
    `  ELM version (ATI): ${or(i.info?.version)}`,
    `  Description (AT@1): ${or(i.info?.description)}`,
    `  Protocol (ATDPN): ${or(i.info?.protocol)}`,
    `  Voltage (ATRV): ${or(i.info?.voltage)}`,
    "",
    "Bluetooth",
    `  Notify characteristic: ${or(i.selected?.notify)}`,
    `  Write characteristic: ${or(i.selected?.write)}`,
    `  Write method: ${or(i.writeMethod)}`,
    `  UUID overrides: ${overrides.length ? overrides.join(", ") : "none (auto-pick)"}`,
    "  GATT:",
    ...(i.gatt.length
      ? i.gatt.flatMap((s) => [`    service ${s.uuid}`, ...s.characteristics.map((c) => `      ${c.uuid} [${c.properties.join(", ")}]`)])
      : ["    (none discovered)"]),
    "",
    `Last ${LOG_LINES} debug lines (UTC; ␍ = CR, ␊ = LF)`,
    ...(i.log.length
      ? i.log.slice(-LOG_LINES).map((l) => `${new Date(l.t).toISOString().slice(11, 23)} ${ARROW[l.dir]} ${show(l.text)}`)
      : ["(empty)"]),
  ];
  return `${lines.join("\n")}\n`;
}

/** Clipboard write, feature-detected. False means the caller should show the text for manual copying. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

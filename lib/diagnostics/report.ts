import { describeDtc } from "../obd/dtc";
import type { MonitorStatus } from "./readiness";
import type { Scan } from "./scan";

const round = (n: number) => Math.round(n * 100) / 100;
const codes = (list: string[] | null) => list?.map((code) => ({ code, description: describeDtc(code) })) ?? null;
const readiness = (s: MonitorStatus | null) => s && { ignition: s.ignition, monitors: s.monitors };

/** The export shape shared by JSON and CSV. null = not read / not supported by the car. */
export function toReport(scan: Scan) {
  return {
    app: "OBD Dash",
    scannedAt: new Date(scan.at).toISOString(),
    afterClear: !!scan.afterClear,
    vin: scan.vin,
    mil: scan.status?.mil ?? null,
    dtcCount: scan.status?.dtcCount ?? null,
    codes: { stored: codes(scan.stored), pending: codes(scan.pending), permanent: codes(scan.permanent) },
    readiness: { sinceClear: readiness(scan.status), thisDriveCycle: readiness(scan.thisCycle) },
    freezeFrame: scan.freezeFrame && {
      dtc: scan.freezeFrame.dtc,
      values: scan.freezeFrame.values.map((v) => ({ ...v, value: round(v.value) })),
    },
    errors: scan.errors,
  };
}

export const toJson = (scan: Scan) => JSON.stringify(toReport(scan), null, 2);

export const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One flat table: section,item,value,unit (RFC 4180 quoting, CRLF). */
export function toCsv(scan: Scan): string {
  const r = toReport(scan);
  const rows: unknown[][] = [
    ["section", "item", "value", "unit"],
    ["scan", "timestamp", r.scannedAt, ""],
    ["scan", "after_clear", r.afterClear, ""],
    ["scan", "vin", r.vin ?? "not reported", ""],
    ["status", "mil", r.mil === null ? "unknown" : r.mil ? "on" : "off", ""],
    ["status", "dtc_count", r.dtcCount ?? "unknown", ""],
  ];
  for (const [mode, list] of Object.entries(r.codes)) {
    rows.push([mode, "count", list ? list.length : "read failed", ""]);
    for (const c of list ?? []) rows.push([mode, c.code, c.description, ""]);
  }
  for (const [key, s] of [["readiness_since_clear", r.readiness.sinceClear], ["readiness_this_drive_cycle", r.readiness.thisDriveCycle]] as const) {
    if (!s) rows.push([key, "status", "not available", ""]);
    else for (const m of s.monitors) rows.push([key, m.name, m.state, ""]);
  }
  if (r.freezeFrame) {
    rows.push(["freeze_frame", "dtc", r.freezeFrame.dtc ?? "unknown", ""]);
    for (const v of r.freezeFrame.values) rows.push(["freeze_frame", v.name, v.value, v.unit]);
  } else rows.push(["freeze_frame", "status", "none stored", ""]);
  for (const e of r.errors) rows.push(["error", "", e, ""]);
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export const fileName = (scan: Scan, ext: string) =>
  `obd-scan-${scan.vin ?? "no-vin"}-${new Date(scan.at).toISOString().slice(0, 19).replace(/:/g, "-")}.${ext}`;

/** Saves text as a file on the device; nothing is uploaded. */
export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // revoking synchronously can cancel the download in some browsers
}

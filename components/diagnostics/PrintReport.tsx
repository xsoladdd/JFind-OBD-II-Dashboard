"use client";

import { createPortal } from "react-dom";
import { useMounted } from "@/components/connect/hooks";
import { toReport } from "@/lib/diagnostics/report";
import type { Scan } from "@/lib/diagnostics/scan";

// Printing shows only this report, whatever app shell surrounds the page.
const PRINT_CSS = `@media print {
  body > :not(.diag-print) { display: none !important; }
  body { background: #fff !important; color: #000 !important; }
}`;

const TH = "border-b border-black py-1 pr-3 text-left";
const TD = "border-b border-zinc-300 py-1 pr-3 align-top";

/** The report for window.print() ("Save as PDF"): every section, black on white, hidden on screen. */
export function PrintReport({ scan }: { scan: Scan }) {
  const mounted = useMounted();
  if (!mounted) return null;
  const r = toReport(scan);
  const sections = [
    ["Stored codes (Mode 03)", r.codes.stored],
    ["Pending codes (Mode 07)", r.codes.pending],
    ["Permanent codes (Mode 0A)", r.codes.permanent],
  ] as const;
  const readiness = [
    ["Readiness since codes cleared (0101)", r.readiness.sinceClear, "not supported"],
    ["Readiness this drive cycle (0141)", r.readiness.thisDriveCycle, "not enabled"],
  ] as const;

  return createPortal(
    <div className="diag-print hidden bg-white p-2 text-sm text-black print:block">
      <style>{PRINT_CSS}</style>
      <h1 className="text-2xl font-bold">OBD Dash diagnostic report</h1>
      <p className="mt-1">
        Scanned {new Date(scan.at).toLocaleString()}
        {r.afterClear && " (re-read after clearing codes)"}
      </p>
      <table className="mt-3">
        <tbody>
          <tr>
            <td className="pr-4 font-semibold">VIN</td>
            <td className="font-mono">{r.vin ?? "not reported"}</td>
          </tr>
          <tr>
            <td className="pr-4 font-semibold">Check-engine light</td>
            <td>{r.mil === null ? "unknown" : r.mil ? "ON" : "off"}</td>
          </tr>
          <tr>
            <td className="pr-4 font-semibold">Confirmed codes (0101)</td>
            <td>{r.dtcCount ?? "unknown"}</td>
          </tr>
        </tbody>
      </table>

      {sections.map(([title, codes]) => (
        <section key={title} className="mt-4 break-inside-avoid">
          <h2 className="font-bold">{title}</h2>
          {codes === null ? (
            <p>Couldn&apos;t be read.</p>
          ) : codes.length === 0 ? (
            <p>None.</p>
          ) : (
            <table className="w-full">
              <tbody>
                {codes.map((c) => (
                  <tr key={c.code}>
                    <td className={`${TD} w-24 font-mono font-bold`}>{c.code}</td>
                    <td className={TD}>{c.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}

      <section className="mt-4 break-inside-avoid">
        <h2 className="font-bold">Freeze frame (Mode 02, frame 0){r.freezeFrame?.dtc ? `: ${r.freezeFrame.dtc}` : ""}</h2>
        {!r.freezeFrame ? (
          <p>None stored.</p>
        ) : (
          <table>
            <tbody>
              {r.freezeFrame.values.map((v) => (
                <tr key={v.id}>
                  <td className={TD}>{v.name}</td>
                  <td className={`${TD} text-right font-mono`}>{v.value}</td>
                  <td className={TD}>{v.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {readiness.map(([title, s, unsupported]) => (
        <section key={title} className="mt-4 break-inside-avoid">
          <h2 className="font-bold">
            {title}
            {s && ` · ${s.ignition} ignition`}
          </h2>
          {!s ? (
            <p>Not available.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className={TH}>Monitor</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {s.monitors.map((m) => (
                  <tr key={m.name}>
                    <td className={TD}>{m.name}</td>
                    <td className={TD}>{m.state === "unsupported" ? unsupported : m.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}

      {r.errors.length > 0 && (
        <section className="mt-4">
          <h2 className="font-bold">Read errors</h2>
          <ul className="list-disc pl-5">
            {r.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-xs">
        Generated on this device by OBD Dash. Descriptions cover generic SAE J2012 P0 codes (todrobbins/dtcdb); other codes show as
        manufacturer-specific / unknown.
      </p>
    </div>,
    document.body,
  );
}

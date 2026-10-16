"use client";

import { download, fileName, toCsv, toJson } from "@/lib/diagnostics/report";
import type { Scan } from "@/lib/diagnostics/scan";

const BTN = "rounded-md border border-zinc-600 px-3 py-2 text-sm font-medium hover:bg-zinc-800";

/** JSON / CSV downloads, plus Print (the browser's "Save as PDF") for the scan shown on the page. */
export function ExportButtons({ scan, print = true }: { scan: Scan; print?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button className={BTN} onClick={() => download(fileName(scan, "json"), toJson(scan), "application/json")}>
        Export JSON
      </button>
      <button className={BTN} onClick={() => download(fileName(scan, "csv"), toCsv(scan), "text/csv")}>
        Export CSV
      </button>
      {print && (
        <button className={BTN} onClick={() => window.print()}>
          Print / PDF
        </button>
      )}
    </div>
  );
}

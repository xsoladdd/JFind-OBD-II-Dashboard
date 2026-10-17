"use client";

import { Button } from "@/components/ui";
import { download, fileName, toCsv, toJson } from "@/lib/diagnostics/report";
import type { Scan } from "@/lib/diagnostics/scan";

/** JSON / CSV downloads, plus Print (the browser's "Save as PDF") for the scan shown on the page. */
export function ExportButtons({ scan, print = true }: { scan: Scan; print?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => download(fileName(scan, "json"), toJson(scan), "application/json")}>
        Export JSON
      </Button>
      <Button size="sm" onClick={() => download(fileName(scan, "csv"), toCsv(scan), "text/csv")}>
        Export CSV
      </Button>
      {print && (
        <Button size="sm" onClick={() => window.print()}>
          Print / PDF
        </Button>
      )}
    </div>
  );
}

import { liveDef, useLive } from "../store/live";

export interface Sample {
  t: number;
  id: string;
  value: number;
}

const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Long format, one row per reading, raw registry (metric) units. */
export function toCsv(rows: Sample[]): string {
  const start = rows[0]?.t ?? 0;
  const lines = ["time_iso,elapsed_s,pid,name,value,unit"];
  for (const r of rows) {
    const def = liveDef(r.id);
    lines.push(
      [new Date(r.t).toISOString(), ((r.t - start) / 1000).toFixed(3), r.id, cell(def?.name ?? r.id), String(r.value), cell(def?.unit ?? "")].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/** Collects every new live reading until stop(), which returns the samples. */
export function startRecording() {
  const rows: Sample[] = [];
  const unsub = useLive.subscribe((s, prev) => {
    for (const id in s.values) {
      const v = s.values[id]!;
      if (v !== prev.values[id]) rows.push({ t: v.t, id, value: v.value });
    }
  });
  return {
    get count() {
      return rows.length;
    },
    stop() {
      unsub();
      return rows;
    },
  };
}

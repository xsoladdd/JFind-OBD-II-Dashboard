"use client";

import { useRef, useState } from "react";
import { useGarage } from "@/lib/store/garage";
import { btn, card } from "./ui";

export function Backup() {
  const exportJson = useGarage((s) => s.exportJson);
  const importJson = useGarage((s) => s.importJson);
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function download() {
    const url = URL.createObjectURL(new Blob([exportJson()], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `obd-dash-garage-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    const text = await f.text();
    if (!confirm("Importing replaces everything in this garage with the file's contents. Continue?")) return;
    const r = await importJson(text);
    setMsg(r.ok ? { ok: true, text: "Garage imported." } : { ok: false, text: `Import rejected: ${r.error}` });
    if (file.current) file.current.value = "";
  }

  return (
    <section className={card}>
      <h2 className="font-semibold">Backup</h2>
      <p className="mt-1 text-sm text-zinc-400">A JSON file of every car, service entry and reminder. It is only ever saved on this device.</p>
      <div className="mt-3 flex gap-2">
        <button className={btn} onClick={download}>
          Export JSON
        </button>
        <button className={btn} onClick={() => file.current?.click()}>
          Import JSON
        </button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {msg && (
        <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

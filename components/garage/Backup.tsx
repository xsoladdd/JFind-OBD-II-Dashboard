"use client";

import { useRef, useState } from "react";
import { Button, Disclosure, InlineNote } from "@/components/ui";
import { useGarage } from "@/lib/store/garage";

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
    <Disclosure summary="Backup: export and import">
      <p className="text-fg-muted">A JSON file of every car, service entry and reminder. It is only ever saved on this device.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button onClick={download}>Export JSON</Button>
        <Button onClick={() => file.current?.click()}>Import JSON</Button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {msg && (
        <InlineNote role="status" tone={msg.ok ? "info" : "danger"} className="mt-3">
          {msg.text}
        </InlineNote>
      )}
    </Disclosure>
  );
}

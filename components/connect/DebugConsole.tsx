"use client";

import { useEffect, useRef, useState } from "react";
import { visible } from "@/lib/storage/logs";
import { useConnection, type LogLine } from "@/lib/store/connection";

const QUICK = ["ATI", "ATRV", "ATDPN", "0100", "010C", "010D", "03", "0902"];
const ARROW: Record<LogLine["dir"], string> = { tx: "→", rx: "←", info: "·", error: "!" };
const COLOR: Record<LogLine["dir"], string> = {
  tx: "text-sky-300",
  rx: "text-zinc-300",
  info: "text-emerald-300",
  error: "text-red-300",
};

export function DebugConsole() {
  const { log, gatt, selected, mode, sendRaw, clearLog } = useConnection();
  const [cmd, setCmd] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const send = (c: string) => {
    void sendRaw(c);
    setCmd("");
  };

  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900">
      <summary className="cursor-pointer select-none px-4 py-3 font-semibold">Debug console</summary>
      <div className="space-y-4 px-4 pb-4">
        <div
          ref={logRef}
          className="h-64 overflow-y-auto rounded-md bg-black p-2 font-mono text-xs leading-5"
          aria-label="Raw adapter traffic"
        >
          {log.length === 0 && <p className="text-zinc-500">No traffic yet.</p>}
          {log.map((l) => (
            <div key={l.id} className={`whitespace-pre-wrap break-all ${COLOR[l.dir]}`}>
              <span className="select-none text-zinc-600">{ARROW[l.dir]} </span>
              {l.dir === "rx" ? visible(l.text) : l.text}
            </div>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(cmd);
          }}
        >
          <label htmlFor="raw-cmd" className="sr-only">
            Raw command
          </label>
          <input
            id="raw-cmd"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="AT or OBD command, e.g. 010C"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm"
          />
          <button className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold hover:bg-sky-500">Send</button>
        </form>

        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="rounded border border-zinc-700 px-2 py-1 font-mono text-xs hover:bg-zinc-800"
            >
              {q}
            </button>
          ))}
          <button onClick={clearLog} className="ml-auto text-xs text-zinc-400 underline">
            clear log
          </button>
        </div>

        <div>
          <h3 className="text-sm font-semibold">GATT services &amp; characteristics</h3>
          {mode === "demo" ? (
            <p className="mt-1 text-sm text-zinc-400">Demo mode uses the built-in simulator, so there is no GATT.</p>
          ) : gatt.length === 0 ? (
            <p className="mt-1 text-sm text-zinc-400">Connect to an adapter to list what it exposes.</p>
          ) : (
            <ul className="mt-2 space-y-2 font-mono text-xs">
              {gatt.map((svc) => (
                <li key={svc.uuid}>
                  <div className="text-zinc-300">service {svc.uuid}</div>
                  <ul className="ml-4">
                    {svc.characteristics.map((c) => (
                      <li key={c.uuid} className="text-zinc-400">
                        {c.uuid} [{c.properties.join(", ")}]
                        {selected?.notify === c.uuid && <span className="ml-2 text-emerald-300">← notify</span>}
                        {selected?.write === c.uuid && <span className="ml-2 text-sky-300">← write</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}

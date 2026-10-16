"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Disclosure, Input } from "@/components/ui";
import { visible } from "@/lib/storage/logs";
import { useConnection, type LogLine } from "@/lib/store/connection";

const QUICK = ["ATI", "ATRV", "ATDPN", "0100", "010C", "010D", "03", "0902"];
const ARROW: Record<LogLine["dir"], string> = { tx: "→", rx: "←", info: "·", error: "!" };
const COLOR: Record<LogLine["dir"], string> = {
  tx: "text-accent",
  rx: "text-fg",
  info: "text-fg-faint",
  error: "text-danger-fg",
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
    <Disclosure id="debug-console" summary="Debug console">
      <div className="space-y-4">
        <div
          ref={logRef}
          translate="no"
          className="h-64 overflow-y-auto rounded-control border border-line bg-bg p-3 font-mono text-[13px] leading-5"
          aria-label="Raw adapter traffic"
        >
          {log.length === 0 && <p className="text-fg-faint">No traffic yet.</p>}
          {log.map((l) => (
            <div key={l.id} className={`whitespace-pre-wrap break-all ${COLOR[l.dir]}`}>
              <span className="select-none text-fg-faint">{ARROW[l.dir]} </span>
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
          <Input
            id="raw-cmd"
            name="raw-cmd"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="AT or OBD command, e.g. 010C"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="flex-1 font-mono"
          />
          <Button type="submit" variant="primary">
            Send
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Button key={q} size="sm" translate="no" className="px-3 font-mono" onClick={() => send(q)}>
              {q}
            </Button>
          ))}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={clearLog}>
            Clear log
          </Button>
        </div>

        <div>
          <h3 className="font-semibold">GATT services &amp; characteristics</h3>
          {mode === "demo" ? (
            <p className="mt-1 text-fg-muted">Demo mode uses the built-in simulator, so there is no GATT.</p>
          ) : gatt.length === 0 ? (
            <p className="mt-1 text-fg-muted">Connect to an adapter to list what it exposes.</p>
          ) : (
            <ul className="mt-2 space-y-2 font-mono text-[13px]">
              {gatt.map((svc) => (
                <li key={svc.uuid}>
                  <div className="text-fg">service {svc.uuid}</div>
                  <ul className="ml-4">
                    {svc.characteristics.map((c) => (
                      <li key={c.uuid} className="text-fg-muted">
                        {c.uuid} [{c.properties.join(", ")}]
                        {selected?.notify === c.uuid && <span className="ml-2 text-ok">← notify</span>}
                        {selected?.write === c.uuid && <span className="ml-2 text-accent">← write</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Disclosure>
  );
}

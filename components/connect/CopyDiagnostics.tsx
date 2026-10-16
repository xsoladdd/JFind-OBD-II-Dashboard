"use client";

import { useState } from "react";
import { copyText, formatDiagnostics } from "@/lib/connect/diagnostics";
import { useAdapterInfo } from "@/lib/store/adapterInfo";
import { useConnection } from "@/lib/store/connection";
import { loadOverrides } from "@/lib/transport/uuidSettings";

/** Copies a plain-text summary plus the last debug lines to the clipboard. It never leaves the device by itself. */
export function CopyDiagnostics() {
  const [state, setState] = useState<"idle" | "copied" | { text: string }>("idle");

  const run = async () => {
    const s = useConnection.getState();
    const text = formatDiagnostics({
      now: Date.now(),
      mode: s.mode,
      status: s.status,
      deviceName: s.deviceName,
      error: s.error,
      failure: s.failure,
      vehicleError: s.vehicleError,
      info: useAdapterInfo.getState().info,
      gatt: s.gatt,
      selected: s.selected,
      writeMethod: s.writeMethod,
      overrides: loadOverrides(),
      log: s.log,
    });
    setState((await copyText(text)) ? "copied" : { text });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => void run()} className="min-h-11 rounded-md border border-zinc-600 px-4 text-sm font-semibold hover:bg-zinc-800">
          Copy diagnostics
        </button>
        <span aria-live="polite" className="text-sm text-emerald-300">
          {state === "copied" && "Copied. Paste it where you ask for help."}
        </span>
      </div>
      <p className="text-xs text-zinc-400">
        Copies this summary and the last 50 debug lines to your clipboard, nothing else. The debug lines can include a VIN if you read it.
      </p>
      {typeof state === "object" && (
        <label className="block text-sm">
          <span className="text-amber-200">Copying isn&apos;t available here. Select all of this text and copy it by hand:</span>
          <textarea
            readOnly
            value={state.text}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 h-48 w-full rounded-md border border-zinc-700 bg-black p-2 font-mono text-xs"
          />
        </label>
      )}
    </div>
  );
}

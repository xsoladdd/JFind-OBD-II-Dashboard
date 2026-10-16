"use client";

import { useState } from "react";
import { btn, btnPrimary, card } from "@/components/garage/ui";
import { useFolder } from "@/lib/storage/folder";
import { useSettingsWarning } from "@/lib/storage/settings";

/** Where settings, scans and debug logs are saved, and the buttons to link the folder or allow access again. */
export function FolderCard() {
  const { status, folderName, link, regrant, unlink } = useFolder();
  const warning = useSettingsWarning((s) => s.warning);
  const [error, setError] = useState("");
  const run = (fn: () => Promise<void>) => () => {
    setError("");
    fn().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  const name = <strong className="font-semibold text-zinc-100">{folderName}</strong>;

  if (status === "unsupported")
    return (
      <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p className="font-semibold text-amber-300">History and settings can&apos;t be saved in this browser</p>
        <p className="mt-1">
          Saving needs a browser that can open a folder on this device, such as Chrome or Edge on a computer. Here,
          settings last until you close the tab and scans and debug logs aren&apos;t kept. Everything else works.
        </p>
      </div>
    );

  return (
    <section className={`${card} space-y-3 text-sm`} aria-label="Storage folder">
      {status === "unlinked" && (
        <>
          <p className="text-zinc-300">
            OBD Dash saves settings, scans and debug logs as plain files in a folder you choose. Pick an empty folder,
            or make a new one such as &ldquo;OBD Dash&rdquo;.
          </p>
          <button className={btnPrimary} onClick={run(link)}>
            Choose folder
          </button>
        </>
      )}
      {status === "needs-permission" && (
        <>
          <p className="text-zinc-300">The browser needs your OK again before OBD Dash can save to {name}.</p>
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} onClick={run(regrant)}>
              Allow access to {folderName}
            </button>
            <button className={btn} onClick={run(link)}>
              Choose a different folder
            </button>
          </div>
        </>
      )}
      {status === "ready" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="mr-auto text-zinc-300">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
            Saving to {name}
          </p>
          <span className="flex gap-4">
            <button className="text-sky-300 underline" onClick={run(link)}>
              Change folder
            </button>
            <button
              className="text-zinc-400 underline"
              onClick={() => confirm(`Stop saving to ${folderName}? Its files stay where they are.`) && run(unlink)()}
            >
              Forget folder
            </button>
          </span>
        </div>
      )}
      {warning && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-100">{warning}</p>}
      {error && <p className="text-red-300">{error}</p>}
    </section>
  );
}

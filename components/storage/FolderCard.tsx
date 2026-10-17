"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button, cx, InlineNote, linkClass, panelClass } from "@/components/ui";
import { useFolder } from "@/lib/storage/folder";
import { useSettingsWarning } from "@/lib/storage/settings";

/** Where settings, scans, cars and debug logs are saved, and the buttons to link the folder or allow access again. */
export function FolderCard() {
  const { status, folderName, location, link, regrant, unlink } = useFolder();
  const onHistory = usePathname() === "/history";
  const warning = useSettingsWarning((s) => s.warning);
  const [error, setError] = useState("");
  const run = (fn: () => Promise<void>) => () => {
    setError("");
    fn().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  const name = <strong className="font-semibold text-fg">{folderName}</strong>;

  if (status === "unsupported")
    return (
      <InlineNote role="alert" tone="warn" title="History and settings can’t be saved in this browser">
        <p>
          Saving needs a browser that can open a folder on this device, such as Chrome or Edge on a computer. Here,
          settings last until you close the tab and scans and debug logs aren&apos;t kept. Everything else works.
        </p>
      </InlineNote>
    );

  return (
    <section className={cx(panelClass, "space-y-4 p-4 sm:p-5")} aria-label="Storage folder">
      {status === "unlinked" && (
        <>
          <p className="text-fg-muted">
            OBD Dash saves settings, scans, cars and debug logs as plain files in a folder you choose. Pick an empty folder,
            or make a new one such as &ldquo;OBD Dash&rdquo;.
          </p>
          <Button variant="primary" onClick={run(link)}>
            Choose folder
          </Button>
        </>
      )}
      {status === "needs-permission" && (
        <>
          <p className="text-fg-muted">The browser needs your OK again before OBD Dash can save to {name}.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={run(regrant)}>
              Allow access to {folderName}
            </Button>
            <Button onClick={run(link)}>Choose a different folder</Button>
          </div>
        </>
      )}
      {status === "ready" && location === "browser" && (
        <div className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <span className="size-2.5 rounded-full bg-ok" aria-hidden />
            Saved in this browser
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-fg-muted marker:text-fg-faint">
            <li>This browser can&apos;t open a folder, so settings, scans, cars and logs are kept in its private storage.</li>
            <li>The files aren&apos;t visible in the Files app.</li>
            <li>Clearing this site&apos;s data deletes them.</li>
            <li>
              {onHistory ? (
                "To keep a copy, download files below."
              ) : (
                <>
                  To keep a copy, download files from{" "}
                  <Link href="/history" className={linkClass}>
                    History
                  </Link>
                  .
                </>
              )}
            </li>
          </ul>
        </div>
      )}
      {status === "ready" && location !== "browser" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="mr-auto flex items-center gap-2 text-lg font-semibold">
            <span className="size-2.5 shrink-0 rounded-full bg-ok" aria-hidden />
            <span className="min-w-0">Saving to {name}</span>
          </h2>
          <span className="flex flex-wrap gap-2">
            <Button size="sm" onClick={run(link)}>
              Change folder
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => confirm(`Stop saving to ${folderName}? Its files stay where they are.`) && run(unlink)()}
            >
              Forget folder
            </Button>
          </span>
        </div>
      )}
      {warning && <InlineNote tone="warn">{warning}</InlineNote>}
      {error && (
        <InlineNote role="alert" tone="danger">
          {error}
        </InlineNote>
      )}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useHasBluetooth } from "@/components/connect/hooks";
import { Badge, Button, buttonClass, cx, Disclosure, InlineNote, linkClass, Panel, StoppedOnly } from "@/components/ui";
import { codeCount } from "@/lib/diagnostics/report";
import type { Scan } from "@/lib/diagnostics/scan";
import { SCAN_DIR } from "@/lib/diagnostics/scanFile";
import { useFolder } from "@/lib/storage/folder";
import { useConnection } from "@/lib/store/connection";
import { shownScan, useDiagnostics } from "@/lib/store/diagnostics";
import { ClearDialog } from "./ClearDialog";
import { CodeHistory } from "./CodeHistory";
import { CodeTabs } from "./CodeTabs";
import { ExportButtons } from "./ExportButtons";
import { PrintReport } from "./PrintReport";
import { Readiness, readyCount } from "./Readiness";

const when = (at: number) => new Date(at).toLocaleString();
const ROW_LINK = "flex min-h-11 flex-col justify-center py-2";

/** Lets a deep link (e.g. from /history) connect in place; same store as the Connect screen. */
function ConnectPrompt() {
  const hasBt = useHasBluetooth();
  const { status, error, connect } = useConnection();
  const busy = status === "connecting" || status === "reconnecting";
  return (
    <Panel aria-live="polite">
      <h2 className="text-balance text-5xl font-bold tracking-tight">{busy ? "Connecting…" : "Not connected"}</h2>
      <p className="mt-2 text-lg text-fg-muted">Connect to the adapter to read codes.</p>
      {error && (
        <InlineNote tone="danger" className="mt-4">
          {error}
        </InlineNote>
      )}
      <div className="mt-5 grid gap-4">
        <Button size="drive" variant="primary" onClick={() => void connect("ble")} disabled={!hasBt || busy}>
          Connect
        </Button>
        <Button size="drive" onClick={() => void connect("demo")} disabled={busy}>
          Demo mode
        </Button>
      </div>
      <Link href="/" className={cx(linkClass, "mt-3 inline-flex min-h-11 items-center")}>
        Connection settings and debug console
      </Link>
    </Panel>
  );
}

/** The answer to "is anything wrong?": the code count as a word, the check-engine light, and the count per list. */
function Answer({ scan }: { scan: Scan | null }) {
  const n = scan && codeCount(scan);
  const mil = scan?.status?.mil;
  const word = !scan ? "Not read yet" : n === null ? "Codes not read" : n === 0 ? "No codes" : `${n} ${n === 1 ? "code" : "codes"}`;
  return (
    <div aria-live="polite">
      <h2 className={cx("text-balance text-5xl font-bold tracking-tight", !!n && "text-warn")}>{word}</h2>
      {scan && (
        <>
          <p className={cx("mt-3 text-xl font-semibold", mil ? "text-warn" : mil === false ? "text-ok" : "text-fg-muted")}>
            Check-engine light {mil === undefined ? "unknown" : mil ? "on" : "off"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["stored", "pending", "permanent"] as const).map((k) => (
              <Badge key={k} tone={scan[k] === null ? "warn" : "neutral"}>
                {k[0]!.toUpperCase() + k.slice(1)} {scan[k]?.length ?? "not read"}
              </Badge>
            ))}
            {scan.afterClear && (
              <Badge tone="accent">
                Re-read after clearing
              </Badge>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Opens /diagnostics?scan=<file name>. Isolated in Suspense so the rest of the page stays prerendered. */
function ScanFromUrl() {
  const name = useSearchParams().get("scan");
  const ready = useFolder((s) => s.status === "ready");
  const openFile = useDiagnostics((s) => s.openFile);
  useEffect(() => {
    void openFile(name);
  }, [name, ready, openFile]);
  return null;
}

/** Where the latest scan went. Without a folder the exports are the only record. */
function SaveNote() {
  const { savedAs, saveError } = useDiagnostics();
  const { status, folderName, location } = useFolder();
  if (saveError) return <p className="text-sm text-danger-fg">{saveError}</p>;
  if (status !== "ready")
    return (
      <p className="text-sm text-warn">
        <Link href="/history" className="underline underline-offset-4">
          Choose a folder (History page) to save scans
        </Link>
        . Export JSON, CSV or PDF still works.
      </p>
    );
  if (!savedAs) return null;
  return (
    <p className="break-all text-sm text-fg-muted">
      {location === "browser" ? `Saved in this browser: ${SCAN_DIR}/${savedAs}` : `Saved to ${folderName}/${SCAN_DIR}/${savedAs}`}
    </p>
  );
}

function OpenedNote({ name, before }: { name: string; before: Scan | null }) {
  const list = (codes: string[] | null) => (codes === null ? "couldn’t read" : codes.join(", ") || "none");
  return (
    <InlineNote title={before ? "Saved clear-codes run" : "Saved scan"}>
      <p className="break-all font-mono text-sm">{name}</p>
      {before && (
        <p className="mt-2">
          Before clearing: stored <span className="font-mono">{list(before.stored)}</span>, pending{" "}
          <span className="font-mono">{list(before.pending)}</span>. Shown here: the re-read after clearing.
        </p>
      )}
    </InlineNote>
  );
}

function RecentScans() {
  const recent = useDiagnostics((s) => s.recent);
  const viewing = useDiagnostics((s) => s.viewing?.name);
  return (
    <Disclosure summary="Saved scans">
      {recent.length ? (
        <ul className="divide-y divide-line">
          {recent.map((f) => (
            <li key={f.name}>
              <Link
                href={`/diagnostics?scan=${encodeURIComponent(f.name)}`}
                aria-current={viewing === f.name ? "page" : undefined}
                className={cx(ROW_LINK, "hover:text-accent aria-[current=page]:text-accent")}
              >
                <span className="num text-lg">{when(f.lastModified)}</span>
                <span className="break-all font-mono text-sm text-fg-faint">{f.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted">No saved scans yet.</p>
      )}
      <Link href="/history" className={cx(linkClass, "mt-2 inline-flex min-h-11 items-center")}>
        All scans and logs
      </Link>
    </Disclosure>
  );
}

function Details({ scan }: { scan: Scan }) {
  return (
    <Disclosure summary="Scan details">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-fg-muted">Confirmed codes</dt>
        <dd>{scan.status ? `${scan.status.dtcCount} reported by the ECU (0101)` : "unknown"}</dd>
        <dt className="text-fg-muted">VIN</dt>
        <dd className="break-all font-mono">{scan.vin ?? "not reported"}</dd>
        <dt className="text-fg-muted">Scanned</dt>
        <dd>{when(scan.at)}</dd>
      </dl>
    </Disclosure>
  );
}

function ReadinessSection({ scan }: { scan: Scan }) {
  const [done, total] = readyCount(scan.status);
  return (
    <Disclosure
      summary={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          Readiness
          {scan.status && (
            <Badge tone={done === total ? "ok" : "warn"}>
              {done} of {total} complete
            </Badge>
          )}
        </span>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Readiness title="Since codes cleared" pid="0101" status={scan.status} />
        <Readiness title="This drive cycle" pid="0141" status={scan.thisCycle} cycle />
      </div>
    </Disclosure>
  );
}

/**
 * Top: the answer (code count, check-engine light) and one big Read codes. The codes list follows; readiness,
 * export, saved scans, code history and clearing sit behind disclosures or stay parked-only.
 */
export function DiagnosticsScreen() {
  const connected = useConnection((s) => s.status === "connected");
  const { live, viewing, viewError, reading, error, read, loadRecent } = useDiagnostics();
  const folderStatus = useFolder((s) => s.status);
  const [clearOpen, setClearOpen] = useState(false);
  const scan = shownScan({ viewing, live });

  useEffect(() => {
    void loadRecent();
  }, [folderStatus, loadRecent]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8 short:py-4">
      <Suspense>
        <ScanFromUrl />
      </Suspense>
      <h1 className="mb-5 text-3xl font-bold tracking-tight short:mb-3 short:text-2xl">Diagnostics</h1>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start short:grid-cols-2 short:items-start">
        <div className={cx("space-y-4", !scan && "lg:col-span-2 lg:max-w-xl short:col-span-2")}>
          {viewError && (
            <InlineNote tone="danger" role="alert">
              {viewError}{" "}
              <Link href="/diagnostics" className="underline underline-offset-4">
                Back to live scan
              </Link>
            </InlineNote>
          )}
          {!viewing && !connected ? (
            <ConnectPrompt />
          ) : (
            <Panel>
              <Answer scan={scan} />
              {scan && scan.errors.length > 0 && (
                <InlineNote tone="danger" title="Some reads failed" className="mt-4">
                  <ul className="list-disc space-y-1 pl-5">
                    {scan.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </InlineNote>
              )}
              <div className="mt-5 space-y-3">
                {viewing ? (
                  <>
                    <OpenedNote name={viewing.name} before={viewing.file.kind === "clear" ? viewing.file.before : null} />
                    <Link href="/diagnostics" className={cx(buttonClass("secondary", "drive"), "w-full")}>
                      Back to live scan
                    </Link>
                  </>
                ) : (
                  <>
                    <Button size="drive" variant="primary" className="w-full" onClick={() => void read()} loading={reading}>
                      {reading ? "Reading" : live ? "Read codes again" : "Read codes"}
                    </Button>
                    {!live && !reading && <p className="text-fg-muted">Turn the key to ON, then read the codes.</p>}
                    {error && (
                      <InlineNote tone="danger" role="alert">
                        {error}
                      </InlineNote>
                    )}
                    <SaveNote />
                  </>
                )}
              </div>
            </Panel>
          )}
        </div>

        {scan && <CodeTabs key={scan.at} scan={scan} />}

        <div className="space-y-4 lg:col-span-2 short:col-span-2">
          {scan && <ReadinessSection scan={scan} />}
          {scan && (
            <Disclosure summary="Export and report">
              <p className="mb-3 text-fg-muted">Files are made on this device. Nothing is sent anywhere.</p>
              <ExportButtons scan={scan} />
            </Disclosure>
          )}
          <RecentScans />
          <CodeHistory />
          {scan && <Details scan={scan} />}
          {connected && !viewing && (
            <StoppedOnly label="Clearing codes">
              <Panel title="Clear codes">
                <p className="mb-4 text-fg-muted">For when the car is parked with the engine off. The next step explains what clearing erases.</p>
                <Button
                  variant="danger"
                  onClick={() => setClearOpen(true)}
                  disabled={!live || reading}
                  title={live ? undefined : "Read the codes first"}
                >
                  Clear codes…
                </Button>
                {!live && <p className="mt-2 text-sm text-fg-faint">Read the codes first.</p>}
              </Panel>
            </StoppedOnly>
          )}
        </div>
      </div>

      {scan && <PrintReport scan={scan} />}
      <ClearDialog open={clearOpen} onClose={() => setClearOpen(false)} />
    </main>
  );
}

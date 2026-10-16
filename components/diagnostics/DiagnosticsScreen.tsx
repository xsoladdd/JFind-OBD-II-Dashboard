"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useHasBluetooth } from "@/components/connect/hooks";
import type { Scan } from "@/lib/diagnostics/scan";
import { SCAN_DIR } from "@/lib/diagnostics/scanFile";
import { useFolder } from "@/lib/storage/folder";
import { useConnection } from "@/lib/store/connection";
import { shownScan, useDiagnostics } from "@/lib/store/diagnostics";
import { ClearDialog } from "./ClearDialog";
import { CodeTabs } from "./CodeTabs";
import { ExportButtons } from "./ExportButtons";
import { PrintReport } from "./PrintReport";
import { Readiness } from "./Readiness";

const CARD = "rounded-lg border border-zinc-800 bg-zinc-900 p-4";
const when = (at: number) => new Date(at).toLocaleString();

/** There is no app shell yet, so the page can connect by itself (same store as the Connect screen). */
function ConnectPrompt() {
  const hasBt = useHasBluetooth();
  const { status, error, connect } = useConnection();
  const busy = status === "connecting" || status === "reconnecting";
  return (
    <section className={CARD}>
      <p className="text-sm text-zinc-300">
        {busy ? "Connecting…" : "Connect to the adapter to read codes."}
      </p>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => void connect("ble")}
          disabled={!hasBt || busy}
          className="rounded-md bg-sky-600 px-5 py-3 font-semibold hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Connect
        </button>
        <button
          onClick={() => void connect("demo")}
          disabled={busy}
          className="rounded-md border border-zinc-600 px-5 py-3 font-semibold hover:bg-zinc-800 disabled:opacity-40"
        >
          Demo mode
        </button>
      </div>
      <Link href="/" className="mt-3 inline-block text-sm text-sky-300 underline">
        Connection settings and debug console
      </Link>
    </section>
  );
}

function Summary({ scan }: { scan: Scan }) {
  const mil = scan.status?.mil;
  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            mil === undefined ? "bg-zinc-800 text-zinc-300" : mil ? "bg-amber-500/25 text-amber-200" : "bg-emerald-600/25 text-emerald-200"
          }`}
        >
          Check-engine light {mil === undefined ? "unknown" : mil ? "ON" : "off"}
        </span>
        {scan.afterClear && <span className="rounded-full bg-sky-600/25 px-3 py-1 text-sm text-sky-200">Re-read after clearing</span>}
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-zinc-400">Confirmed codes</dt>
        <dd>{scan.status ? `${scan.status.dtcCount} reported by the ECU (0101)` : "unknown"}</dd>
        <dt className="text-zinc-400">VIN</dt>
        <dd className="break-all font-mono">{scan.vin ?? "not reported"}</dd>
        <dt className="text-zinc-400">Scanned</dt>
        <dd>{when(scan.at)}</dd>
      </dl>
      {scan.errors.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-300">
          {scan.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </section>
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

/** Where the latest scan went. Without a folder the downloads below are the only record. */
function SaveNote() {
  const { savedAs, saveError } = useDiagnostics();
  const { status, folderName } = useFolder();
  if (saveError) return <p className="text-sm text-red-300">{saveError}</p>;
  if (status !== "ready")
    return (
      <p className="text-sm text-amber-200">
        <Link href="/history" className="underline">
          Choose a folder (History page) to save scans
        </Link>
        . Export JSON, CSV or PDF still works.
      </p>
    );
  if (!savedAs) return null;
  return (
    <p className="break-all text-sm text-emerald-300">
      Saved to {folderName}/{SCAN_DIR}/{savedAs}
    </p>
  );
}

function OpenedBanner({ name, before }: { name: string; before: Scan | null }) {
  const list = (codes: string[] | null) => (codes === null ? "couldn't read" : codes.join(", ") || "none");
  return (
    <div className="space-y-2 rounded-md bg-sky-600/20 p-3 text-sm text-sky-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="break-all">
          Saved {before ? "clear-codes run" : "scan"}: <span className="font-mono">{name}</span>
        </span>
        <Link href="/diagnostics" className="rounded-md border border-sky-400/50 px-3 py-1.5 hover:bg-sky-900">
          Back to live scan
        </Link>
      </div>
      {before && (
        <p>
          Before clearing: stored <span className="font-mono">{list(before.stored)}</span> · pending{" "}
          <span className="font-mono">{list(before.pending)}</span>. Shown below: the re-read after clearing.
        </p>
      )}
    </div>
  );
}

function RecentScans() {
  const recent = useDiagnostics((s) => s.recent);
  const viewing = useDiagnostics((s) => s.viewing?.name);
  if (!recent.length) return null;
  return (
    <section className={CARD}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Recent scans</h2>
        <Link href="/history" className="text-sm text-sky-300 underline">
          All scans
        </Link>
      </div>
      <ul className="mt-2 divide-y divide-zinc-800">
        {recent.map((f) => (
          <li key={f.name}>
            <Link
              href={`/diagnostics?scan=${encodeURIComponent(f.name)}`}
              aria-current={viewing === f.name ? "page" : undefined}
              className="block py-2.5 text-sm hover:text-sky-200 aria-[current=page]:text-sky-300"
            >
              <span className="block">{when(f.lastModified)}</span>
              <span className="block break-all font-mono text-xs text-zinc-500">{f.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
    <main className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
      <Suspense>
        <ScanFromUrl />
      </Suspense>
      <header>
        <h1 className="text-2xl font-bold">Diagnostics</h1>
        <p className="text-sm text-zinc-400">Trouble codes, freeze frame and emissions readiness. Everything stays on this device.</p>
      </header>

      {viewError && (
        <p className="rounded-md bg-red-600/20 p-3 text-sm text-red-100">
          {viewError}{" "}
          <Link href="/diagnostics" className="underline">
            Back to live scan
          </Link>
        </p>
      )}

      {viewing ? (
        <OpenedBanner name={viewing.name} before={viewing.file.kind === "clear" ? viewing.file.before : null} />
      ) : (
        <>
          {!connected && <ConnectPrompt />}
          {connected && (
            <section className={`${CARD} space-y-3`}>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => void read()}
                  disabled={reading}
                  className="rounded-md bg-sky-600 px-5 py-3 font-semibold hover:bg-sky-500 disabled:opacity-40"
                >
                  {reading ? "Reading…" : live ? "Read codes again" : "Read codes"}
                </button>
                <button
                  onClick={() => setClearOpen(true)}
                  disabled={!live || reading}
                  title={live ? undefined : "Read the codes first"}
                  className="rounded-md border border-red-700 px-5 py-3 font-semibold text-red-200 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear codes…
                </button>
              </div>
              <SaveNote />
            </section>
          )}
          {error && <p className="rounded-md bg-red-600/20 p-3 text-sm text-red-100">{error}</p>}
        </>
      )}

      {scan ? (
        <>
          <Summary scan={scan} />
          <ExportButtons scan={scan} />
          <CodeTabs key={scan.at} scan={scan} />
          <div className="grid gap-4 md:grid-cols-2">
            <Readiness title="Since codes cleared" pid="0101" status={scan.status} />
            <Readiness title="This drive cycle" pid="0141" status={scan.thisCycle} cycle />
          </div>
          <PrintReport scan={scan} />
        </>
      ) : (
        connected && !viewing && <p className="text-sm text-zinc-400">Turn the key to ON and tap Read codes.</p>
      )}

      <RecentScans />
      <ClearDialog open={clearOpen} onClose={() => setClearOpen(false)} />
    </main>
  );
}

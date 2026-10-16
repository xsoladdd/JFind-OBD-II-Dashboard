"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useHasBluetooth } from "@/components/connect/hooks";
import type { Scan } from "@/lib/diagnostics/scan";
import { useConnection } from "@/lib/store/connection";
import { useDiagnostics } from "@/lib/store/diagnostics";
import { ClearDialog } from "./ClearDialog";
import { CodeTabs } from "./CodeTabs";
import { ExportButtons } from "./ExportButtons";
import { PrintReport } from "./PrintReport";
import { Readiness } from "./Readiness";

const CARD = "rounded-lg border border-zinc-800 bg-zinc-900 p-4";
const when = (at: number) => new Date(at).toLocaleString();
const count = (l: string[] | null) => l?.length ?? "?";

/** There is no app shell yet, so the page can connect by itself (same store as the Connect screen). */
function ConnectPrompt() {
  const hasBt = useHasBluetooth();
  const { status, error, connect } = useConnection();
  const busy = status === "connecting" || status === "reconnecting";
  return (
    <section className={CARD}>
      <p className="text-sm text-zinc-300">
        {busy ? "Connecting…" : "Connect to the adapter to read codes. Saved scans below work offline."}
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

function History() {
  const { history, viewing, live, open, remove } = useDiagnostics();
  if (!history.length) return null;
  return (
    <section className={CARD}>
      <h2 className="text-lg font-semibold">Scan history</h2>
      <p className="text-sm text-zinc-400">Saved on this device only.</p>
      <ul className="mt-3 divide-y divide-zinc-800">
        {history.map((s) => {
          const shown = (viewing ?? live)?.at === s.at;
          return (
            <li key={s.at} className="space-y-2 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium">
                  {when(s.at)}
                  {s.afterClear && <span className="ml-2 text-xs text-sky-300">after clear</span>}
                </span>
                <span className="font-mono text-xs text-zinc-400">{s.vin ?? "no VIN"}</span>
              </div>
              <p className="text-sm text-zinc-400">
                {count(s.stored)} stored · {count(s.pending)} pending · {count(s.permanent)} permanent
                {s.status?.mil && <span className="ml-2 text-amber-300">CEL on</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => open(s.at === live?.at ? null : s)}
                  disabled={shown}
                  className="rounded-md border border-zinc-600 px-3 py-2 text-sm font-medium hover:bg-zinc-800 disabled:opacity-40"
                >
                  {shown ? "Showing" : "Open"}
                </button>
                <ExportButtons scan={s} print={false} />
                <button
                  onClick={() => window.confirm(`Delete the scan from ${when(s.at)}? This can't be undone.`) && void remove(s.at)}
                  className="rounded-md border border-red-800 px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-950"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function DiagnosticsScreen() {
  const connected = useConnection((s) => s.status === "connected");
  const { live, viewing, reading, error, read, open, loadHistory } = useDiagnostics();
  const [clearOpen, setClearOpen] = useState(false);
  const scan = viewing ?? live;

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">Diagnostics</h1>
        <p className="text-sm text-zinc-400">Trouble codes, freeze frame and emissions readiness. Everything stays on this device.</p>
      </header>

      {!connected && <ConnectPrompt />}

      {connected && (
        <section className={`${CARD} flex flex-col gap-2 sm:flex-row`}>
          <button
            onClick={() => void read()}
            disabled={reading}
            className="rounded-md bg-sky-600 px-5 py-3 font-semibold hover:bg-sky-500 disabled:opacity-40"
          >
            {reading ? "Reading…" : live ? "Read codes again" : "Read codes"}
          </button>
          <button
            onClick={() => {
              open(null);
              setClearOpen(true);
            }}
            disabled={!live || reading}
            title={live ? undefined : "Read the codes first"}
            className="rounded-md border border-red-700 px-5 py-3 font-semibold text-red-200 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear codes…
          </button>
        </section>
      )}

      {error && <p className="rounded-md bg-red-600/20 p-3 text-sm text-red-100">{error}</p>}

      {viewing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-sky-600/20 p-3 text-sm text-sky-100">
          <span>Viewing the saved scan from {when(viewing.at)}.</span>
          <button onClick={() => open(null)} className="rounded-md border border-sky-400/50 px-3 py-1.5 hover:bg-sky-900">
            {live ? "Back to latest" : "Close"}
          </button>
        </div>
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
        connected && <p className="text-sm text-zinc-400">Turn the key to ON and tap Read codes.</p>
      )}

      <History />
      <ClearDialog open={clearOpen} onClose={() => setClearOpen(false)} />
    </main>
  );
}

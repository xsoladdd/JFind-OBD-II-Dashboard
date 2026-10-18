"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FolderCard } from "@/components/storage/FolderCard";
import { Button, buttonClass, InlineNote, panelClass, SegmentedControl, Sheet, StoppedOnly } from "@/components/ui";
import { readText, removeFile, useFolder } from "@/lib/storage/folder";
import { listLogs, listScans, type ScanSummary } from "@/lib/storage/history";

type LogFile = Awaited<ReturnType<typeof listLogs>>[number];
type Picked = { kind: "scan"; file: ScanSummary } | { kind: "log"; file: LogFile };

const size = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);
const when = (t: string | number) => new Date(t).toLocaleString();
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const scanKind = (s: ScanSummary) => (s.kind === "clear" ? "Clear codes" : s.kind === "read" ? "Read codes" : "Scan");
const ROW = "flex min-h-16 w-full flex-col justify-center gap-0.5 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-2 sm:px-5";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Folder status first, then one list (scans or logs, newest first). A file's viewer and actions open in a sheet. */
export function HistoryPage() {
  const status = useFolder((s) => s.status);
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [logs, setLogs] = useState<LogFile[]>([]);
  const [tab, setTab] = useState<"scans" | "logs">("scans");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [viewing, setViewing] = useState<{ name: string; text: string } | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0); // bumped to re-read the folder

  useEffect(() => {
    if (status !== "ready") return;
    let live = true;
    Promise.all([listScans(), listLogs()]).then(
      ([s, l]) => {
        if (!live) return;
        setScans(s);
        setLogs(l);
      },
      (e: unknown) => live && setError(`Couldn’t read the folder: ${errMsg(e)}`),
    );
    return () => void (live = false);
  }, [status, version]);

  async function remove(path: string, label: string) {
    if (!confirm(`Delete ${label}? The file is removed from your folder and can’t be restored.`)) return;
    setPicked(null);
    try {
      await removeFile(path);
      if (viewing?.name === path) setViewing(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(`Couldn’t delete ${label}: ${errMsg(e)}`);
    }
  }

  async function view(name: string) {
    if (viewing?.name === `logs/${name}`) return setViewing(null);
    try {
      setViewing({ name: `logs/${name}`, text: (await readText(`logs/${name}`)) ?? "" });
    } catch (e) {
      setError(`Couldn’t open ${name}: ${errMsg(e)}`);
    }
  }

  async function save(path: string) {
    try {
      download(path.split("/")[1]!, (await readText(path)) ?? "");
    } catch (e) {
      const name = path.split("/")[1];
      setError(`Couldn’t read ${name}: ${errMsg(e)}`);
    }
  }

  const ready = status === "ready";
  const close = () => {
    setPicked(null);
    setViewing(null);
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8 short:py-4">
      <h1 className="mb-5 text-3xl font-bold tracking-tight short:mb-3 short:text-2xl">History</h1>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start short-wide:grid-cols-2 short:items-start">
        <FolderCard />

        <div className="space-y-4">
          {error && (
            <InlineNote tone="danger" role="alert">
              {error}
            </InlineNote>
          )}
          <SegmentedControl
            label="Saved files"
            value={tab}
            onChange={setTab}
            options={[
              { value: "scans", label: `Scans ${ready ? scans.length : ""}` },
              { value: "logs", label: `Debug logs ${ready ? logs.length : ""}` },
            ]}
          />

          {tab === "scans" ? (
            !ready ? (
              <p className="text-fg-muted">Link a folder to see saved scans.</p>
            ) : scans.length === 0 ? (
              <p className="text-fg-muted">No scans yet. Scans you run on the Diagnostics page are saved here.</p>
            ) : (
              <ul className={`${panelClass} divide-y divide-line overflow-hidden`} aria-label="Scans, newest first">
                {scans.map((s) => (
                  <li key={s.name}>
                    <button type="button" aria-haspopup="dialog" className={ROW} onClick={() => setPicked({ kind: "scan", file: s })}>
                      {s.takenAt ? (
                        <>
                          <span className="num text-2xl">{when(s.takenAt)}</span>
                          <span className="text-fg-muted">
                            {scanKind(s)}, <span className="font-mono text-sm">{s.vin ?? "no VIN"}</span>
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="break-all font-mono text-sm">{s.name}</span>
                          <span className="text-warn">Not a readable scan file</span>
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : !ready ? (
            <p className="text-fg-muted">Link a folder to see saved debug logs.</p>
          ) : logs.length === 0 ? (
            <p className="text-fg-muted">No logs yet. Connect (or use Demo mode) and the traffic is saved here.</p>
          ) : (
            <ul className={`${panelClass} divide-y divide-line overflow-hidden`} aria-label="Debug logs, newest first">
              {logs.map((l) => (
                <li key={l.name}>
                  <button type="button" aria-haspopup="dialog" className={ROW} onClick={() => setPicked({ kind: "log", file: l })}>
                    <span className="num text-2xl">{when(l.lastModified)}</span>
                    <span className="text-fg-muted">
                      <span className="num">{size(l.size)}</span>, <span className="break-all font-mono text-sm">{l.name}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tab === "logs" && (
            <p className="text-sm text-fg-faint">
              Raw adapter traffic, one file per connection (a new file every 2 MB). ␍ and ␊ mark CR and LF.
            </p>
          )}
        </div>
      </div>

      <Sheet
        open={!!picked}
        onClose={close}
        title={picked?.kind === "scan" ? (picked.file.takenAt ? when(picked.file.takenAt) : "Scan file") : "Debug log"}
      >
        {picked && (
          <div className="space-y-4 px-2 pb-2">
            <p className="break-all font-mono text-sm text-fg-muted">{picked.file.name}</p>
            {picked.kind === "scan" ? (
              <>
                {picked.file.takenAt && (
                  <p>
                    {scanKind(picked.file)}, <span className="font-mono">{picked.file.vin ?? "no VIN"}</span>
                  </p>
                )}
                <div className="grid gap-3">
                  {picked.file.takenAt && (
                    <Link href={`/diagnostics?scan=${encodeURIComponent(picked.file.name)}`} className={buttonClass("primary")}>
                      Open in Diagnostics
                    </Link>
                  )}
                  <Button onClick={() => void save(`scans/${picked.file.name}`)}>Download</Button>
                  <Button variant="danger" onClick={() => void remove(`scans/${picked.file.name}`, `scan ${picked.file.name}`)}>
                    Delete…
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p>
                  <span className="num">{size(picked.file.size)}</span>, last written {when(picked.file.lastModified)}
                </p>
                <div className="grid gap-3">
                  <Button variant="primary" aria-expanded={viewing?.name === `logs/${picked.file.name}`} onClick={() => void view(picked.file.name)}>
                    {viewing?.name === `logs/${picked.file.name}` ? "Hide log" : "View log"}
                  </Button>
                  {viewing?.name === `logs/${picked.file.name}` && (
                    <StoppedOnly label="The log viewer">
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-control bg-bg p-3 font-mono text-xs leading-5 text-fg-muted">
                        {viewing.text || "(empty)"}
                      </pre>
                    </StoppedOnly>
                  )}
                  <Button onClick={() => void save(`logs/${picked.file.name}`)}>Download</Button>
                  <Button variant="danger" onClick={() => void remove(`logs/${picked.file.name}`, `log ${picked.file.name}`)}>
                    Delete…
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>
    </main>
  );
}

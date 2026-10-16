"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { btn, card } from "@/components/garage/ui";
import { FolderCard } from "@/components/storage/FolderCard";
import { readText, removeFile, useFolder } from "@/lib/storage/folder";
import { listLogs, listScans, type ScanSummary } from "@/lib/storage/history";

type LogFile = Awaited<ReturnType<typeof listLogs>>[number];

const size = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);
const when = (t: string | number) => new Date(t).toLocaleString();
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function HistoryPage() {
  const status = useFolder((s) => s.status);
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [logs, setLogs] = useState<LogFile[]>([]);
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
      (e: unknown) => live && setError(`Couldn't read the folder: ${errMsg(e)}`),
    );
    return () => void (live = false);
  }, [status, version]);

  async function remove(path: string, label: string) {
    if (!confirm(`Delete ${label}? The file is removed from your folder and can't be restored.`)) return;
    try {
      await removeFile(path);
      if (viewing?.name === path) setViewing(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(`Couldn't delete ${label}: ${errMsg(e)}`);
    }
  }

  async function view(name: string) {
    if (viewing?.name === `logs/${name}`) return setViewing(null);
    try {
      setViewing({ name: `logs/${name}`, text: (await readText(`logs/${name}`)) ?? "" });
    } catch (e) {
      setError(`Couldn't open ${name}: ${errMsg(e)}`);
    }
  }

  async function save(path: string) {
    try {
      download(path.split("/")[1]!, (await readText(path)) ?? "");
    } catch (e) {
      const name = path.split("/")[1];
      setError(`Couldn't read ${name}: ${errMsg(e)}`);
    }
  }

  const ready = status === "ready";

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">History</h1>
        <p className="text-sm text-zinc-400">Diagnostic scans and debug logs you can download or delete, newest first.</p>
      </header>

      <FolderCard />
      {error && <p className="rounded-md border border-red-800 bg-red-950 p-3 text-sm text-red-200">{error}</p>}

      <section className={card}>
        <h2 className="font-semibold">Scans</h2>
        {!ready ? (
          <p className="mt-2 text-sm text-zinc-400">Link a folder to see saved scans.</p>
        ) : scans.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">No scans yet. Scans you run on the Diagnostics page are saved here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-800">
            {scans.map((s) => (
              <li key={s.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                {s.takenAt ? (
                  <Link href={`/diagnostics?scan=${encodeURIComponent(s.name)}`} className="mr-auto min-w-0 hover:underline">
                    <span className="block font-semibold text-sky-300">{when(s.takenAt)}</span>
                    <span className="block text-xs text-zinc-400">
                      {s.kind === "clear" ? "Clear codes" : s.kind === "read" ? "Read codes" : "Scan"} ·{" "}
                      <span className="font-mono">{s.vin ?? "no VIN"}</span>
                    </span>
                  </Link>
                ) : (
                  <span className="mr-auto min-w-0">
                    <span className="block break-all font-mono text-xs">{s.name}</span>
                    <span className="block text-xs text-amber-300">Not a readable scan file</span>
                  </span>
                )}
                <button className={btn} onClick={() => void save(`scans/${s.name}`)}>
                  Download
                </button>
                <button className="text-red-300 underline" onClick={() => void remove(`scans/${s.name}`, `scan ${s.name}`)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="font-semibold">Debug logs</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Raw adapter traffic, one file per connection (a new file every 2 MB). ␍ and ␊ mark CR and LF.
        </p>
        {!ready ? (
          <p className="mt-2 text-sm text-zinc-400">Link a folder to see saved debug logs.</p>
        ) : logs.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">No logs yet. Connect (or use Demo mode) and the traffic is saved here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-800">
            {logs.map((l) => (
              <li key={l.name} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="w-full min-w-0 sm:mr-auto sm:w-auto">
                    <span className="block break-all font-mono text-xs">{l.name}</span>
                    <span className="block text-xs text-zinc-400">
                      {size(l.size)} · last written {when(l.lastModified)}
                    </span>
                  </span>
                  <button className={btn} aria-expanded={viewing?.name === `logs/${l.name}`} onClick={() => void view(l.name)}>
                    {viewing?.name === `logs/${l.name}` ? "Hide" : "View"}
                  </button>
                  <button className={btn} onClick={() => void save(`logs/${l.name}`)}>
                    Download
                  </button>
                  <button className="text-red-300 underline" onClick={() => void remove(`logs/${l.name}`, `log ${l.name}`)}>
                    Delete
                  </button>
                </div>
                {viewing?.name === `logs/${l.name}` && (
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black p-2 font-mono text-xs leading-5 text-zinc-300">
                    {viewing.text || "(empty)"}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

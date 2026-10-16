// Writes the debug console's traffic to logs/<time>_<ble|demo>.log, one file per connection session. See docs/storage.md.
import { useConnection, type LogLine } from "../store/connection";
import { appendText, fileStamp, useFolder } from "./folder";

/** CR/LF shown as ␍/␊, as in the debug console: it keeps chunk boundaries visible and one event on one line. */
export const visible = (t: string) => t.replace(/\r/g, "␍").replace(/\n/g, "␊");

/** Each file stops at about 2 MB and the next one starts: enough for a long session, small enough to open on a phone. */
export const LOG_CAP = 2 * 1024 * 1024;
const FLUSH_MS = 5000;

const encoder = new TextEncoder();
// shortcut: two files started in the same second share a name and are appended together; add a counter if that matters.
const fileName = (t: number, mode: "ble" | "demo") => `logs/${fileStamp(new Date(t))}_${mode}.log`;

interface Session {
  mode: "ble" | "demo";
  file: string;
  written: number; // bytes already in `file`
  pending: { text: string; bytes: number; t: number }[];
  pendingBytes: number;
  timer?: ReturnType<typeof setTimeout>;
}

/** Writes a session's buffered lines. Decides rotation synchronously; the folder queue keeps the appends in order. */
function flush(s: Session) {
  clearTimeout(s.timer);
  s.timer = undefined;
  if (!s.pending.length || useFolder.getState().status !== "ready") return; // keep buffering until the folder is back
  const writes: [string, string][] = [];
  let chunk = "";
  for (const l of s.pending) {
    if (s.written > 0 && s.written + l.bytes > LOG_CAP) {
      if (chunk) writes.push([s.file, chunk]);
      chunk = "";
      s.file = fileName(l.t, s.mode);
      s.written = 0;
    }
    chunk += l.text;
    s.written += l.bytes;
  }
  writes.push([s.file, chunk]);
  s.pending = [];
  s.pendingBytes = 0;
  // A failed write (folder removed or access revoked) drops those lines; the in-app console still shows them.
  for (const [file, text] of writes) void appendText(file, text).catch(() => {});
}

/** Starts recording; call once in the browser. Returns a function that stops it. Never touches the ELM queue. */
export function startLogRecorder(): () => void {
  let session: Session | null = null;
  let lastId = useConnection.getState().log.at(-1)?.id ?? -1;

  const add = (s: Session, l: LogLine) => {
    const text = `${new Date(l.t).toISOString()} ${l.dir} ${visible(l.text)}\n`;
    const bytes = encoder.encode(text).length;
    s.pending.push({ text, bytes, t: l.t });
    s.pendingBytes += bytes;
    if (s.pendingBytes > LOG_CAP) flush(s);
    // Still over: the folder isn't ready, so the buffer keeps only the newest ~LOG_CAP of lines.
    while (s.pendingBytes > LOG_CAP) s.pendingBytes -= s.pending.shift()!.bytes;
    if (!s.timer) s.timer = setTimeout(() => flush(s), FLUSH_MS);
  };

  const stopConn = useConnection.subscribe((st, prev) => {
    if (st.status === "connecting" && prev.status !== "connecting") {
      if (session) flush(session);
      const mode = st.mode ?? "demo";
      session = { mode, file: fileName(Date.now(), mode), written: 0, pending: [], pendingBytes: 0 };
    }
    if (st.log !== prev.log) {
      let i = st.log.length;
      while (i > 0 && st.log[i - 1]!.id > lastId) i--;
      for (const l of st.log.slice(i)) if (session) add(session, l);
      lastId = Math.max(lastId, st.log.at(-1)?.id ?? -1);
    }
    // Write right away on disconnect or failure. The session stays open, so the late "disconnected" line still lands in it.
    if (st.status !== prev.status && (st.status === "idle" || st.status === "error") && session) flush(session);
  });
  const stopFolder = useFolder.subscribe((f, prev) => {
    if (f.status === "ready" && prev.status !== "ready" && session) flush(session);
  });

  return () => {
    stopConn();
    stopFolder();
    if (session) flush(session);
  };
}

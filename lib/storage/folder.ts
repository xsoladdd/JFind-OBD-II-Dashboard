// THROWAWAY STUB (JOID-0002). JOID-0006 owns this file: take its version wholesale at rebase and delete this one.
// It implements only the agreed contract, in memory, so the Diagnostics page can be built and tested against it.
import { create } from "zustand";

type FolderStatus = "unsupported" | "unlinked" | "needs-permission" | "ready";

export class FolderUnavailableError extends Error {
  constructor() {
    super("No folder is linked (choose one on the History page)");
    this.name = "FolderUnavailableError";
  }
}

const files = new Map<string, { text: string; lastModified: number }>();

export const useFolder = create<{
  status: FolderStatus;
  folderName: string;
  link: () => Promise<void>;
  regrant: () => Promise<void>;
  unlink: () => Promise<void>;
}>((set) => ({
  status: "unlinked",
  folderName: "",
  link: async () => set({ status: "ready", folderName: "Stub folder" }),
  regrant: async () => set({ status: "ready" }),
  unlink: async () => set({ status: "unlinked", folderName: "" }),
}));

function ready() {
  if (useFolder.getState().status !== "ready") throw new FolderUnavailableError();
}

export async function writeText(path: string, text: string): Promise<void> {
  ready();
  files.set(path, { text, lastModified: Date.now() });
}

export async function appendText(path: string, text: string): Promise<void> {
  ready();
  files.set(path, { text: (files.get(path)?.text ?? "") + text, lastModified: Date.now() });
}

export async function readText(path: string): Promise<string | null> {
  ready();
  return files.get(path)?.text ?? null;
}

export async function listFiles(dir: string): Promise<{ name: string; size: number; lastModified: number }[]> {
  ready();
  const prefix = `${dir}/`;
  return [...files]
    .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
    .map(([p, f]) => ({ name: p.slice(prefix.length), size: f.text.length, lastModified: f.lastModified }));
}

export async function removeFile(path: string): Promise<void> {
  ready();
  files.delete(path);
}

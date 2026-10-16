// Test helper, not app code. In-memory stand-ins for FileSystemDirectoryHandle / FileSystemFileHandle. Writes commit on close(), like the real swap file.
type Perm = "granted" | "denied" | "prompt";
const named = (name: string) => Object.assign(new Error(name), { name });
const enc = new TextEncoder();

export class FakeFile {
  readonly kind = "file";
  data = "";
  lastModified = 0;
  constructor(readonly name: string) {}
  async getFile() {
    const d = this.data;
    return { size: enc.encode(d).length, lastModified: this.lastModified, text: async () => d };
  }
  async createWritable(o?: { keepExistingData?: boolean }) {
    let buf = o?.keepExistingData ? this.data : "";
    let pos = 0;
    return {
      seek: async (bytes: number) => void (pos = new TextDecoder().decode(enc.encode(buf).slice(0, bytes)).length),
      write: async (t: string) => void ((buf = buf.slice(0, pos) + t + buf.slice(pos + t.length)), (pos += t.length)),
      close: async () => void ((this.data = buf), (this.lastModified = Date.now())),
    };
  }
}

export class FakeDir {
  readonly kind = "directory";
  entries = new Map<string, FakeDir | FakeFile>();
  constructor(
    readonly name: string,
    readonly perm: { query: Perm; request: Perm } = { query: "granted", request: "granted" },
  ) {}
  async queryPermission() {
    return this.perm.query;
  }
  async requestPermission() {
    return (this.perm.query = this.perm.request);
  }
  async getDirectoryHandle(n: string, o?: { create?: boolean }) {
    const e = this.entries.get(n) ?? (o?.create ? this.entries.set(n, new FakeDir(n)).get(n)! : null);
    if (!e) throw named("NotFoundError");
    if (e.kind !== "directory") throw named("TypeMismatchError");
    return e;
  }
  async getFileHandle(n: string, o?: { create?: boolean }) {
    const e = this.entries.get(n) ?? (o?.create ? this.entries.set(n, new FakeFile(n)).get(n)! : null);
    if (!e) throw named("NotFoundError");
    if (e.kind !== "file") throw named("TypeMismatchError");
    return e;
  }
  async removeEntry(n: string) {
    if (!this.entries.delete(n)) throw named("NotFoundError");
  }
  async *values() {
    yield* this.entries.values();
  }
  /** test helper: the file at "a/b", or undefined */
  file(path: string): FakeFile | undefined {
    const [head, ...rest] = path.split("/");
    const e = this.entries.get(head!);
    return rest.length ? (e instanceof FakeDir ? e.file(rest.join("/")) : undefined) : e instanceof FakeFile ? e : undefined;
  }
  seed(path: string, text: string) {
    const [dir, name] = path.includes("/") ? path.split("/") : [null, path];
    const d = dir ? ((this.entries.get(dir) as FakeDir | undefined) ?? this.entries.set(dir, new FakeDir(dir)).get(dir)!) : this;
    const f = new FakeFile(name!);
    f.data = text;
    (d as FakeDir).entries.set(name!, f);
    return this;
  }
}

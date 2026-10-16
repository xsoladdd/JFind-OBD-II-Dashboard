/**
 * Custom PID formulas, parsed and evaluated without eval / new Function.
 * Grammar (C-like precedence, lowest first): | , & , << >> , + - , * / , unary -, then numbers (12, 0.5, 0x1F),
 * data bytes A–Z (A = first byte after the response prefix), helper calls and parentheses.
 */
export class FormulaError extends Error {
  name = "FormulaError";
}

type Op = "|" | "&" | "<<" | ">>" | "+" | "-" | "*" | "/";
type Node =
  | { k: "num"; v: number }
  | { k: "byte"; i: number }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: Op; a: Node; b: Node }
  | { k: "fn"; f: (x: number) => number; a: Node };

const MAX_LEN = 500;
const MAX_DEPTH = 32;

/** Explicit helpers. A Map, so names like "constructor" or "__proto__" can't resolve to anything. */
const FNS = new Map<string, (x: number) => number>([
  ["signed", (x) => ((x & 0xff) >= 0x80 ? (x & 0xff) - 0x100 : x & 0xff)], // 8-bit two's complement
  ["signed16", (x) => ((x & 0xffff) >= 0x8000 ? (x & 0xffff) - 0x10000 : x & 0xffff)],
]);
export const FORMULA_HELPERS = [...FNS.keys()];

const LEVELS: Op[][] = [["|"], ["&"], ["<<", ">>"], ["+", "-"], ["*", "/"]];
const TOKEN = /\s*(?:(0x[0-9a-f]+|\d+(?:\.\d+)?|\.\d+)|([a-z_][a-z0-9_]*)|(<<|>>|[-+*/&|()]))/iy;

type Tok = { num?: number; name?: string; sym?: string; at: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < src.length) {
    if (/^\s*$/.test(src.slice(TOKEN.lastIndex))) break;
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(src);
    if (!m) {
      const pos = at + (src.slice(at).length - src.slice(at).trimStart().length);
      throw new FormulaError(`Unexpected "${src[pos]}" at position ${pos + 1}`);
    }
    if (m[1]) out.push({ num: Number(m[1]), at });
    else if (m[2]) out.push({ name: m[2], at });
    else out.push({ sym: m[3], at });
  }
  return out;
}

function parse(src: string): Node {
  if (src.length > MAX_LEN) throw new FormulaError(`Formula is too long (max ${MAX_LEN} characters)`);
  const toks = tokenize(src);
  if (!toks.length) throw new FormulaError("Formula is empty");
  let pos = 0;
  let depth = 0;
  const peek = () => toks[pos];
  const expect = (sym: string) => {
    if (peek()?.sym !== sym) throw new FormulaError(`Expected "${sym}"${peek() ? ` at position ${peek()!.at + 1}` : " at the end"}`);
    pos++;
  };
  const deeper = () => {
    if (++depth > MAX_DEPTH) throw new FormulaError("Formula is nested too deeply");
  };

  const level = (n: number): Node => {
    if (n === LEVELS.length) return unary();
    let a = level(n + 1);
    while (peek()?.sym && (LEVELS[n] as string[]).includes(peek()!.sym!)) {
      const op = toks[pos++]!.sym as Op;
      a = { k: "bin", op, a, b: level(n + 1) };
    }
    return a;
  };

  const unary = (): Node => {
    const t = peek();
    if (t?.sym === "-") {
      pos++;
      deeper();
      const a = unary();
      depth--;
      return { k: "neg", a };
    }
    return primary();
  };

  const primary = (): Node => {
    const t = toks[pos++];
    if (!t) throw new FormulaError("Formula ends too early");
    if (t.num !== undefined) return { k: "num", v: t.num };
    if (t.sym === "(") {
      deeper();
      const a = level(0);
      expect(")");
      depth--;
      return a;
    }
    if (t.name) {
      if (/^[A-Z]$/.test(t.name)) return { k: "byte", i: t.name.charCodeAt(0) - 65 };
      const f = FNS.get(t.name);
      if (f) {
        expect("(");
        deeper();
        const a = level(0);
        expect(")");
        depth--;
        return { k: "fn", f, a };
      }
      if (/^[a-z]$/.test(t.name)) throw new FormulaError(`Data bytes are capital letters: write ${t.name.toUpperCase()}, not ${t.name}`);
      if (/^[A-Z]+$/.test(t.name)) throw new FormulaError(`"${t.name}" isn't a byte. Combine bytes explicitly, e.g. A*256+B`);
      throw new FormulaError(`Unknown name "${t.name}". Allowed: bytes A–Z and ${FORMULA_HELPERS.map((h) => `${h}()`).join(", ")}`);
    }
    throw new FormulaError(`Unexpected "${t.sym}" at position ${t.at + 1}`);
  };

  const tree = level(0);
  if (pos < toks.length) throw new FormulaError(`Unexpected "${toks[pos]!.sym ?? toks[pos]!.name ?? toks[pos]!.num}" at position ${toks[pos]!.at + 1}`);
  return tree;
}

function maxByte(n: Node): number {
  if (n.k === "byte") return n.i;
  if (n.k === "num") return -1;
  if (n.k === "bin") return Math.max(maxByte(n.a), maxByte(n.b));
  return maxByte(n.a);
}

function run(n: Node, d: number[]): number {
  switch (n.k) {
    case "num":
      return n.v;
    case "byte":
      return d[n.i]!;
    case "neg":
      return -run(n.a, d);
    case "fn":
      return n.f(run(n.a, d));
    case "bin": {
      const a = run(n.a, d);
      const b = run(n.b, d);
      if (n.op === "/" && b === 0) throw new FormulaError("Division by zero");
      return n.op === "+" ? a + b : n.op === "-" ? a - b : n.op === "*" ? a * b : n.op === "/" ? a / b
        : n.op === "&" ? a & b : n.op === "|" ? a | b : n.op === "<<" ? a << b : a >> b;
    }
  }
}

export interface Formula {
  /** Index of the highest byte used (A = 0), -1 when none. */
  maxByte: number;
  evaluate: (bytes: number[]) => number;
}

/** Parses a formula once; throws FormulaError with a readable message when it isn't allowed. */
export function compile(src: string): Formula {
  const tree = parse(src);
  const top = maxByte(tree);
  return {
    maxByte: top,
    evaluate: (bytes) => {
      if (bytes.length <= top)
        throw new FormulaError(`Formula uses ${String.fromCharCode(65 + top)} but the reply has ${bytes.length} data byte${bytes.length === 1 ? "" : "s"}`);
      const v = run(tree, bytes);
      if (!Number.isFinite(v)) throw new FormulaError("Formula result isn't a finite number");
      return v;
    },
  };
}

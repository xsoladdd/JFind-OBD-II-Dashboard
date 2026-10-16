import { describe, expect, it } from "vitest";
import { compile, FormulaError } from "./formula";

const ev = (src: string, bytes: number[] = [0x12, 0x34, 0x80, 0xff]) => compile(src).evaluate(bytes);

describe("custom PID formula", () => {
  it.each([
    ["A", 0x12],
    ["A*256+B", 0x1234],
    ["(A*256+B)/10-40", 0x1234 / 10 - 40],
    ["A+B*2", 0x12 + 0x34 * 2],
    ["(A+B)*2", (0x12 + 0x34) * 2],
    ["A-B-C", 0x12 - 0x34 - 0x80],
    ["A/2/3", 0x12 / 6],
    ["-A", -0x12],
    ["--A", 0x12],
    ["-(A+1)*2", -(0x13 * 2)],
    ["2*-A", -0x24],
    ["0x10 + 1.5", 17.5],
    [".5*4", 2],
    ["signed(C)", -128],
    ["signed(D)", -1],
    ["signed(A)", 0x12],
    ["signed16(C*256+D)", 0x80ff - 0x10000],
    ["signed16(A*256+B)", 0x1234],
    ["A & 0x0F", 0x02],
    ["A | 0x01", 0x13],
    ["B >> 4", 3],
    ["A << 8 | B", 0x1234],
    ["A << 8 + B", 0x12 << (8 + 0x34)], // + binds tighter than <<, as in C
    ["C >> 7 & 1", 1],
    ["  A\t*\n2 ", 0x24],
  ])("%s", (src, want) => {
    expect(ev(src)).toBeCloseTo(want, 9);
  });

  it("reports the highest byte used", () => {
    expect(compile("A*256+B").maxByte).toBe(1);
    expect(compile("42").maxByte).toBe(-1);
    expect(compile("signed(D)").maxByte).toBe(3);
  });

  it("refuses to read past the reply", () => {
    expect(() => compile("A*256+B").evaluate([1])).toThrow("Formula uses B but the reply has 1 data byte");
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["A +", "ends too early"],
    ["(A", 'Expected ")"'],
    ["A)", 'Unexpected ")"'],
    ["A B", 'Unexpected "B"'],
    ["2A", 'Unexpected "A"'],
    ["a*2", "capital letters"],
    ["AB", "isn't a byte"],
    ["signed A", 'Expected "("'],
    ["A/0", "Division by zero"],
    ["A/(B-B)", "Division by zero"],
    ["A**2", 'Unexpected "*"'],
    ["A%2", 'Unexpected "%"'],
    ["A^2", 'Unexpected "^"'],
    ["A==1", 'Unexpected "="'],
    ["1e999", 'Unexpected "e999"'],
  ])("rejects %j", (src, msg) => {
    expect(() => ev(src)).toThrow(FormulaError);
    expect(() => ev(src)).toThrow(msg);
  });

  it.each([
    "constructor",
    "__proto__",
    "toString(A)",
    "A.constructor",
    "A['constructor']",
    "alert(1)",
    "eval('1')",
    "Function('return 1')()",
    "process.exit()",
    "globalThis",
    "this",
    "A;B",
    "A,B",
    "`${A}`",
    "A=1",
    "x=>x",
    "new Date()",
    "import('fs')",
    "A /* */",
    "A // B",
  ])("rejects malicious %j", (src) => {
    expect(() => ev(src)).toThrow(FormulaError);
  });

  it("caps length and nesting instead of overflowing the stack", () => {
    expect(() => compile("A+".repeat(5000) + "A")).toThrow("too long");
    expect(() => compile("(".repeat(40) + "A" + ")".repeat(40))).toThrow("nested too deeply");
    expect(() => compile("-".repeat(40) + "A")).toThrow("nested too deeply");
    expect(compile("(".repeat(20) + "A" + ")".repeat(20)).evaluate([7])).toBe(7);
  });

  it("rejects a non-finite result", () => {
    expect(() => ev("99999999999999999999999999*99999999999999999999*99999999999999999999*99999999999999999999*99999999999999999999*99999999999999999999*99999999999999999999*99999999999999999999*99999999999999999999*99999999999999999999*99999999999999999999*99999999999999999999*99999999999999999999*99999999999999999999*99999999999999999999*99999999999999999999")).toThrow("finite");
  });
});

const LETTERS = "PCBU";

/** Two DTC bytes → "P0133". Returns null for the 00 00 padding. */
export function decodeDtc(a: number, b: number): string | null {
  if (a === 0 && b === 0) return null;
  const hex = (n: number, w: number) => n.toString(16).toUpperCase().padStart(w, "0");
  return `${LETTERS[a >> 6]}${(a >> 4) & 0x3}${hex(a & 0xf, 1)}${hex(b, 2)}`;
}

/** Inverse of decodeDtc, used by the simulator. */
export function encodeDtc(code: string): [number, number] {
  const letter = LETTERS.indexOf(code[0]!.toUpperCase());
  const d1 = parseInt(code[1]!, 16);
  const d2 = parseInt(code[2]!, 16);
  return [(letter << 6) | (d1 << 4) | d2, parseInt(code.slice(3, 5), 16)];
}

/** Phase 2 replaces this with the bundled SAE J2012 table. Never guess a description. */
export function describeDtc(code: string): string {
  void code;
  return "Manufacturer-specific / unknown";
}

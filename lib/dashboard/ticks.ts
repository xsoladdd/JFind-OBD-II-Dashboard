/** Round tick values (steps of 1/2/5 × 10^k) inside [min, max], roughly `count` of them. */
export function niceTicks(min: number, max: number, count: number) {
  const raw = ((max - min) / count) * 0.8;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

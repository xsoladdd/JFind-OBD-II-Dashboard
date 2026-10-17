import type { UnitSystem } from "../units";

/** IUGG mean Earth radius, metres. Equirectangular is plenty for a single drive's extent. */
const R = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export interface RouteFit {
  xy: [number, number][];
  /** SVG units per metre. */
  scale: number;
  bar: { px: number; label: string };
}

/** Largest 1/2/5 × 10^k ≤ n. */
const niceFloor = (n: number) => {
  const mag = 10 ** Math.floor(Math.log10(n));
  return [5, 2, 1].map((m) => m * mag).find((s) => s <= n)!;
};

/** Projects lat/lon onto a w×h box (north up), fitted with `pad`, plus a round-numbered scale bar ~¼ of the width. */
export function fitRoute(pts: { lat: number; lon: number }[], w: number, h: number, pad: number, units: UnitSystem = "metric"): RouteFit {
  if (!pts.length) return { xy: [], scale: 1, bar: { px: 0, label: "" } };
  const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  const lon0 = pts.reduce((a, p) => a + p.lon, 0) / pts.length;
  const k = Math.cos(rad(lat0));
  const m = pts.map((p) => [R * rad(p.lon - lon0) * k, R * rad(p.lat - lat0)] as const);
  const xs = m.map((p) => p[0]);
  const ys = m.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // A parked car is a single point: show at least 100 m across.
  const scale = Math.min((w - 2 * pad) / Math.max(x1 - x0, 100), (h - 2 * pad) / Math.max(y1 - y0, 100));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const xy = m.map(([x, y]) => [w / 2 + (x - cx) * scale, h / 2 - (y - cy) * scale] as [number, number]);

  const unitM = units === "imperial" ? 0.3048 : 1; // feet or metres
  const target = (w - 2 * pad) / 4 / scale / unitM;
  const big = units === "imperial" ? 5280 : 1000;
  const n = target >= big ? niceFloor(target / big) * big : niceFloor(target);
  const label = units === "imperial" ? (n >= big ? `${n / big} mi` : `${n} ft`) : n >= big ? `${n / big} km` : `${n} m`;
  return { xy, scale, bar: { px: n * unitM * scale, label } };
}

/** Every k-th index so at most `max` remain, always keeping the last one. */
export function decimate(n: number, max: number): number[] {
  const step = Math.max(1, Math.ceil(n / max));
  const out: number[] = [];
  for (let i = 0; i < n; i += step) out.push(i);
  if (n && out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
}

/** Low → high: blue, teal, green, amber, red. */
export const RAMP = ["#3987e5", "#14a3a3", "#199e70", "#c98500", "#d9403a"];
export const rampColor = (v: number, min: number, max: number) =>
  RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.floor(((v - min) / (max - min || 1)) * RAMP.length)))]!;

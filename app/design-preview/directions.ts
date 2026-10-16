// TEMPORARY: design-direction mockups for JOID-0014. Deleted once a direction is chosen.
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans_Condensed, Manrope } from "next/font/google";
import type { CSSProperties } from "react";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--p-archivo" });
const manrope = Manrope({ subsets: ["latin"], variable: "--p-manrope" });
const plexCond = IBM_Plex_Sans_Condensed({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--p-plexcond" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--p-plexmono" });

export type DirectionId = "cluster" | "nightline" | "telemetry";

export interface Direction {
  id: DirectionId;
  name: string;
  fontClass: string;
  vars: CSSProperties;
  /** Label treatment: sentence case, or small mono caps. */
  labels: "sentence" | "mono-caps";
  gauge: "thick" | "thin" | "ticks";
}

const v = (o: Record<string, string>) => o as CSSProperties;

export const DIRECTIONS: Record<DirectionId, Direction> = {
  cluster: {
    id: "cluster",
    name: "Cluster",
    fontClass: archivo.variable,
    labels: "sentence",
    gauge: "thick",
    vars: v({
      "--bg": "oklch(0.155 0.006 70)",
      "--s1": "oklch(0.195 0.007 70)",
      "--s2": "oklch(0.24 0.008 70)",
      "--line": "oklch(0.31 0.009 70)",
      "--text": "oklch(0.96 0.005 80)",
      "--muted": "oklch(0.76 0.01 75)",
      "--faint": "oklch(0.64 0.012 75)",
      "--accent": "oklch(0.89 0.19 122)",
      "--on-accent": "oklch(0.2 0.04 122)",
      "--ok": "oklch(0.89 0.19 122)",
      "--warn": "oklch(0.82 0.15 75)",
      "--danger": "oklch(0.68 0.2 27)",
      "--r-panel": "14px",
      "--r-ctl": "10px",
      "--font-ui": "var(--p-archivo)",
      "--font-num": "var(--p-archivo)",
      "--num-stretch": "75%",
      "--num-weight": "700",
    }),
  },
  nightline: {
    id: "nightline",
    name: "Nightline",
    fontClass: manrope.variable,
    labels: "sentence",
    gauge: "thin",
    vars: v({
      "--bg": "oklch(0.145 0.022 255)",
      "--s1": "oklch(0.185 0.026 255)",
      "--s2": "oklch(0.23 0.03 255)",
      "--line": "oklch(0.3 0.032 255)",
      "--text": "oklch(0.95 0.01 240)",
      "--muted": "oklch(0.77 0.025 245)",
      "--faint": "oklch(0.65 0.03 245)",
      "--accent": "oklch(0.84 0.11 200)",
      "--on-accent": "oklch(0.2 0.04 220)",
      "--ok": "oklch(0.8 0.13 160)",
      "--warn": "oklch(0.83 0.14 80)",
      "--danger": "oklch(0.7 0.18 22)",
      "--r-panel": "20px",
      "--r-ctl": "999px",
      "--font-ui": "var(--p-manrope)",
      "--font-num": "var(--p-manrope)",
      "--num-stretch": "100%",
      "--num-weight": "300",
    }),
  },
  telemetry: {
    id: "telemetry",
    name: "Telemetry",
    fontClass: `${plexCond.variable} ${plexMono.variable}`,
    labels: "mono-caps",
    gauge: "ticks",
    vars: v({
      "--bg": "oklch(0.135 0 0)",
      "--s1": "oklch(0.165 0 0)",
      "--s2": "oklch(0.21 0 0)",
      "--line": "oklch(0.33 0 0)",
      "--text": "oklch(0.95 0 0)",
      "--muted": "oklch(0.75 0 0)",
      "--faint": "oklch(0.63 0 0)",
      "--accent": "oklch(0.95 0 0)",
      "--on-accent": "oklch(0.15 0 0)",
      "--ok": "oklch(0.82 0.17 145)",
      "--warn": "oklch(0.86 0.16 90)",
      "--danger": "oklch(0.66 0.22 28)",
      "--r-panel": "2px",
      "--r-ctl": "2px",
      "--font-ui": "var(--p-plexcond)",
      "--font-num": "var(--p-plexmono)",
      "--num-stretch": "100%",
      "--num-weight": "500",
    }),
  },
};

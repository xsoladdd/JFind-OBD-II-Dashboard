"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { GarageNavBadge } from "@/components/garage/GarageNavBadge";
import { NAV } from "@/lib/nav";

/** Optional per-route badges beside a nav label (lib/nav.ts entries carry no badge field). */
const BADGES: Record<string, ComponentType> = { "/garage": GarageNavBadge };

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** Renders whatever lib/nav.ts holds: a bottom tab bar on phones, a sidebar list from md up. */
export function NavLinks({ variant }: { variant: "tabs" | "side" }) {
  const path = usePathname();
  return (
    <ul className={variant === "tabs" ? "flex" : "flex flex-col gap-1"}>
      {NAV.map((n) => {
        const active = isActive(path, n.href);
        const Badge = BADGES[n.href];
        return (
          <li key={n.href} className={variant === "tabs" ? "relative min-w-0 flex-1" : undefined}>
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={
                variant === "tabs"
                  ? `block truncate px-1 py-3 text-center text-xs font-semibold ${active ? "text-sky-300" : "text-zinc-400"}`
                  : `block rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-zinc-800 text-sky-300" : "text-zinc-300 hover:bg-zinc-900"}`
              }
            >
              {n.label}
              {variant === "side" && Badge && <Badge />}
            </Link>
            {/* Beside the label would be cut off by the tab's truncate, so it sits in the tab's corner. */}
            {variant === "tabs" && Badge && (
              <span className="pointer-events-none absolute right-0 top-0">
                <Badge />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

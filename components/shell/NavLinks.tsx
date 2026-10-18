"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType } from "react";
import { GarageNavBadge } from "@/components/garage/GarageNavBadge";
import { cx, Sheet } from "@/components/ui";
import { useDriving } from "@/lib/drive/driving";
import { NAV, splitNav } from "@/lib/nav";

/** Optional per-route badges beside a nav label (lib/nav.ts entries carry no badge field). */
const BADGES: Record<string, ComponentType> = { "/garage": GarageNavBadge };

/** Phone tabs while moving (DESIGN.md "Driving"): only what helps on the road, with bigger targets. */
const DRIVE_TABS = ["/dashboard", "/trips"];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** Phone tab: a bar along the top edge in portrait, along the left edge in the landscape rail. */
// Labels hyphenate instead of clipping in a narrow split-screen pane (260px: about 52px per tab).
const TAB = "relative flex min-h-14 w-full items-center justify-center px-0.5 text-center leading-tight hyphens-auto [overflow-wrap:anywhere] font-semibold transition-colors duration-150 active:bg-surface-1";
const tabTone = (active: boolean) => (active ? "text-fg" : "text-fg-faint hover:text-fg-muted");
const Indicator = () => (
  <span
    aria-hidden
    className="absolute inset-x-4 top-0 h-[3px] rounded-b-sm bg-accent short:inset-x-auto short:inset-y-3 short:left-0 short:h-auto short:w-[3px] short:rounded-r-sm short:rounded-bl-none"
  />
);

/** Renders lib/nav.ts: the sidebar lists everything; phones get the primary tabs plus a "More" sheet. */
export function NavLinks({ variant }: { variant: "tabs" | "side" }) {
  const path = usePathname();
  if (variant === "tabs") return <Tabs path={path} />;
  return (
    <ul className="flex flex-col gap-1">
      {NAV.map((n) => {
        const active = isActive(path, n.href);
        const Badge = BADGES[n.href];
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-11 items-center rounded-control px-3 text-[15px] font-medium transition-colors duration-150",
                active ? "bg-surface-2 text-fg shadow-[inset_3px_0_0_var(--accent)]" : "text-fg-muted hover:bg-surface-1 hover:text-fg",
              )}
            >
              {n.label}
              {Badge && <Badge />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Tabs({ path }: { path: string }) {
  const driving = useDriving();
  const { primary, more } = driving
    ? { primary: NAV.filter((n) => DRIVE_TABS.includes(n.href)), more: NAV.filter((n) => !DRIVE_TABS.includes(n.href)) }
    : splitNav();
  const moreActive = more.some((n) => isActive(path, n.href));
  const [open, setOpen] = useState(false);
  const tab = cx(TAB, driving ? "min-h-18 text-lg short:text-base" : "text-[13px]");

  return (
    <>
      <ul className="flex short:flex-col">
        {primary.map((n) => {
          const active = isActive(path, n.href);
          const Badge = BADGES[n.href];
          return (
            <li key={n.href} className="relative min-w-0 flex-1">
              <Link href={n.href} aria-current={active ? "page" : undefined} className={cx(tab, tabTone(active))}>
                {active && <Indicator />}
                {n.label}
              </Link>
              {/* Beside the label would be cut off by the truncate, so it sits in the tab's corner. */}
              {Badge && (
                <span className="pointer-events-none absolute top-1 right-1">
                  <Badge />
                </span>
              )}
            </li>
          );
        })}
        {more.length > 0 && (
          <li className="relative min-w-0 flex-1">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              className={cx(tab, tabTone(moreActive))}
            >
              {moreActive && <Indicator />}
              More
            </button>
            {/* Badges of the entries inside the sheet stay visible on the tab. */}
            <span className="pointer-events-none absolute top-1 right-1 flex">
              {more.map((n) => {
                const Badge = BADGES[n.href];
                return Badge && <Badge key={n.href} />;
              })}
            </span>
          </li>
        )}
      </ul>

      <Sheet open={open} onClose={() => setOpen(false)} title="More">
        <ul onClick={() => setOpen(false)}>
          {more.map((n) => {
            const active = isActive(path, n.href);
            const Badge = BADGES[n.href];
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex min-h-12 items-center rounded-control px-3 text-base font-medium",
                    active ? "bg-surface-2 text-fg shadow-[inset_3px_0_0_var(--accent)]" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {n.label}
                  {Badge && <Badge />}
                </Link>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}

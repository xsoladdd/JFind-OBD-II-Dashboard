"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type ComponentType } from "react";
import { GarageNavBadge } from "@/components/garage/GarageNavBadge";
import { NAV, splitNav } from "@/lib/nav";

/** Optional per-route badges beside a nav label (lib/nav.ts entries carry no badge field). */
const BADGES: Record<string, ComponentType> = { "/garage": GarageNavBadge };

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

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
              className={`block rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-zinc-800 text-sky-300" : "text-zinc-300 hover:bg-zinc-900"}`}
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
  const { primary, more } = splitNav();
  const moreActive = more.some((n) => isActive(path, n.href));
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <ul className="flex">
        {primary.map((n) => {
          const active = isActive(path, n.href);
          const Badge = BADGES[n.href];
          return (
            <li key={n.href} className="relative min-w-0 flex-1">
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center justify-center truncate px-1 text-center text-xs font-semibold ${active ? "text-sky-300" : "text-zinc-400"}`}
              >
                {n.label}
              </Link>
              {/* Beside the label would be cut off by the truncate, so it sits in the tab's corner. */}
              {Badge && (
                <span className="pointer-events-none absolute right-0 top-0">
                  <Badge />
                </span>
              )}
            </li>
          );
        })}
        {more.length > 0 && (
          <li className="relative min-w-0 flex-1">
            <button
              ref={opener}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => dialog.current?.showModal()}
              className={`flex min-h-12 w-full items-center justify-center px-1 text-xs font-semibold ${moreActive ? "text-sky-300" : "text-zinc-400"}`}
            >
              More
            </button>
            {/* Badges of the entries inside the sheet stay visible on the tab. */}
            <span className="pointer-events-none absolute right-0 top-0 flex">
              {more.map((n) => {
                const Badge = BADGES[n.href];
                return Badge && <Badge key={n.href} />;
              })}
            </span>
          </li>
        )}
      </ul>

      {/* A native modal dialog gives the focus trap, Escape to close and focus restore. A tap on the backdrop
          lands on the dialog element itself, not on its content. */}
      <dialog
        ref={dialog}
        aria-label="More pages"
        onToggle={(e) => setOpen(e.currentTarget.open)}
        onClose={() => opener.current?.focus()}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-xl border border-b-0 border-zinc-700 bg-zinc-900 p-0 text-zinc-100 backdrop:bg-black/70"
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 className="text-sm font-semibold text-zinc-300">More</h2>
          <button
            type="button"
            autoFocus
            onClick={() => dialog.current?.close()}
            className="min-h-11 rounded-md px-3 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
        <ul className="px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]" onClick={() => dialog.current?.close()}>
          {more.map((n) => {
            const active = isActive(path, n.href);
            const Badge = BADGES[n.href];
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 items-center rounded-md px-3 text-base font-medium ${active ? "bg-zinc-800 text-sky-300" : "text-zinc-200 hover:bg-zinc-800"}`}
                >
                  {n.label}
                  {Badge && <Badge />}
                </Link>
              </li>
            );
          })}
        </ul>
      </dialog>
    </>
  );
}

"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { AlertIndicator } from "@/components/alerts/AlertIndicator";
import { initFolder } from "@/lib/storage/folder";
import { startLogRecorder } from "@/lib/storage/logs";
import { useNightDim } from "@/lib/store/settings";
import { watchConnection } from "@/lib/store/toasts";
import { startTripWatcher } from "@/lib/store/trips";
import { ConnectionChip } from "./ConnectionChip";
import { NavLinks } from "./NavLinks";
import { Toaster } from "./Toaster";

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    void initFolder();
    const stopLogs = startLogRecorder();
    const stopToasts = watchConnection();
    return () => {
      stopLogs();
      stopToasts();
    };
  }, []);
  useEffect(startTripWatcher, []); // trips auto-record on any page
  const [dim] = useNightDim();
  useEffect(() => {
    document.documentElement.toggleAttribute("data-dim", dim); // night tokens, app/globals.css
  }, [dim]);

  // usePathname may suspend under cacheComponents on dynamic routes other workers add; keep the shell prerendered.
  const tabs = (variant: "tabs" | "side") => (
    <Suspense fallback={null}>
      <NavLinks variant={variant} />
    </Suspense>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#content"
        className="sr-only z-50 rounded-control bg-accent px-4 py-3 font-semibold text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 drive:hidden flex h-14 items-center gap-3 border-b border-line bg-bg/95 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] backdrop-blur short:h-12">
        <span translate="no" className="shrink-0 text-lg font-extrabold tracking-[0.02em] uppercase [font-stretch:75%]">
          OBD Dash
        </span>
        <div className="ml-auto min-w-0">
          <ConnectionChip />
        </div>
        <AlertIndicator />
      </header>
      <div className="flex flex-1">
        <nav
          aria-label="Main"
          className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r border-line p-3 md:block short:hidden drive:hidden"
        >
          {tabs("side")}
        </nav>
        {/* Room for the tab bar (portrait phone; 72px while driving) or the side rail (landscape phone). */}
        <div
          id="content"
          tabIndex={-1}
          className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] outline-none md:pb-0 short:pb-0 short:pr-[env(safe-area-inset-right)] short:pl-[calc(6rem+env(safe-area-inset-left))] drive:p-0"
        >
          {children}
        </div>
      </div>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden short:top-12 short:right-auto short:block short:w-[calc(6rem+env(safe-area-inset-left))] short:overflow-y-auto short:border-t-0 short:border-r short:pb-0 short:pl-[env(safe-area-inset-left)] drive:hidden"
      >
        {tabs("tabs")}
      </nav>
      <Toaster />
    </div>
  );
}

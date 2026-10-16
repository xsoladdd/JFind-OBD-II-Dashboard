"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { AlertIndicator } from "@/components/alerts/AlertIndicator";
import { watchConnection } from "@/lib/store/toasts";
import { ConnectionChip } from "./ConnectionChip";
import { NavLinks } from "./NavLinks";
import { Toaster } from "./Toaster";

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    return watchConnection();
  }, []);

  // usePathname may suspend under cacheComponents on dynamic routes other workers add; keep the shell prerendered.
  const tabs = (variant: "tabs" | "side") => (
    <Suspense fallback={null}>
      <NavLinks variant={variant} />
    </Suspense>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-zinc-800 bg-zinc-950/95 px-4 backdrop-blur">
        <span className="shrink-0 font-bold tracking-tight">OBD Dash</span>
        <div className="ml-auto min-w-0">
          <ConnectionChip />
        </div>
        <AlertIndicator />
      </header>
      <div className="flex flex-1">
        <nav aria-label="Main" className="hidden w-48 shrink-0 border-r border-zinc-800 p-3 md:block">
          {tabs("side")}
        </nav>
        <div className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
      </div>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {tabs("tabs")}
      </nav>
      <Toaster />
    </div>
  );
}

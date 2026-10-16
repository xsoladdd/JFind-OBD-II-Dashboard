"use client";

import { useHasBluetooth } from "./hooks";

export function CompatBanner() {
  if (useHasBluetooth()) return null;
  return (
    <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
      <p className="font-semibold text-amber-300">This browser can&apos;t talk to Bluetooth adapters</p>
      <p className="mt-1">
        Web Bluetooth works in <strong>Chrome</strong> or <strong>Edge</strong> on desktop and Android. On iPhone and
        iPad, use the <strong>Bluefy</strong> browser. Safari and Firefox don&apos;t support it.
      </p>
      <p className="mt-1">Demo mode below works everywhere.</p>
    </div>
  );
}

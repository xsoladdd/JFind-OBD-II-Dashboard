"use client";

import { InlineNote } from "@/components/ui";
import { useHasBluetooth } from "./hooks";

export function CompatBanner() {
  if (useHasBluetooth()) return null;
  return (
    <InlineNote role="alert" tone="warn" title="This browser can’t talk to Bluetooth adapters">
      <p>
        Web Bluetooth works in <strong>Chrome</strong> or <strong>Edge</strong> on desktop and Android. On iPhone and
        iPad, use the <strong>Bluefy</strong> browser. Safari and Firefox don&apos;t support it.
      </p>
      <p className="mt-1">Demo mode below works everywhere.</p>
    </InlineNote>
  );
}

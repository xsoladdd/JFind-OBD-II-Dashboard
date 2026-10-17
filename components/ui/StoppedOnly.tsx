"use client";

import type { ReactNode } from "react";
import { useDriving } from "@/lib/drive/driving";
import { usePolling } from "@/lib/polling";
import { cx } from "./cx";
import { panelClass } from "./Panel";

const FAST_SPEED = ["010D"];

/**
 * The pure part of StoppedOnly, for tests. While driving, the children stay mounted (so a half-typed form survives a
 * roll at the lights) but hidden and inert, and a big "Available when stopped" panel takes their place.
 */
export function StoppedOnlyView({ driving, label, className, children }: { driving: boolean; label?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <>
      {driving && (
        <div role="status" className={cx(panelClass, "flex min-h-32 flex-col justify-center gap-1 border-dashed px-5 py-6", className)}>
          <p className="text-2xl font-bold">Available when stopped</p>
          {label && <p className="text-lg text-fg-muted">{label}</p>}
        </div>
      )}
      <div hidden={driving} inert={driving} className={driving ? "hidden" : "contents"}>
        {children}
      </div>
    </>
  );
}

/** Wrap anything that needs typing or careful reading. Keeps the vehicle speed polled while it is on screen. */
export function StoppedOnly(props: { label?: ReactNode; className?: string; children: ReactNode }) {
  usePolling(FAST_SPEED);
  return <StoppedOnlyView driving={useDriving()} {...props} />;
}

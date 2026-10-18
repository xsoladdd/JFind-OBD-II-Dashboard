"use client";

import { cx } from "@/components/ui";
import { useRedline } from "@/lib/store/settings";
import { fmt, shortName, useDisplay, ZONE_TEXT, zoneAt, zonesFor } from "./live";

/**
 * One live value for the drive view: short name, big number, unit, and the zone word ("High", "Low") beside the name
 * so nothing shifts when it appears. `valueClass` sets the number's size.
 */
export function Readout({ id, valueClass = "text-5xl", className }: { id: string; valueClass?: string; className?: string }) {
  const [redline] = useRedline();
  const d = useDisplay(id);
  const zone = zoneAt(d.value, zonesFor(id, d, redline));
  return (
    <div className={cx("flex min-w-0 flex-col justify-center gap-1", className)}>
      <div className="flex items-baseline justify-between gap-2 text-lg">
        <span className="truncate font-medium text-fg-muted" title={d.name}>
          {shortName(id, d.name)}
        </span>
        {zone && <span className={cx("shrink-0 font-bold", ZONE_TEXT[zone.tone])}>{zone.word}</span>}
      </div>
      <div className={cx("num truncate leading-none", valueClass, zone ? ZONE_TEXT[zone.tone] : "text-fg")}>
        {d.text && d.live ? d.text(d.live.value) : fmt(d.value, d.unit)}
        <span className="ml-1.5 font-sans text-xl font-medium text-fg-faint [font-stretch:100%]">{d.unit}</span>
      </div>
    </div>
  );
}

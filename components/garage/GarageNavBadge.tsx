"use client";

import { Badge } from "@/components/ui";
import { useGarageDueCount } from "@/lib/store/garage";

/** Render next to the "Garage" nav label: shows the number of overdue + due-soon reminders, nothing when 0. */
export function GarageNavBadge() {
  const n = useGarageDueCount();
  if (n === 0) return null;
  return (
    <Badge tone="count" aria-label={`${n} maintenance reminders due`} className="ml-1.5">
      {n}
    </Badge>
  );
}

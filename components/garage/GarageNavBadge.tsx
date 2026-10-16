"use client";

import { useGarageDueCount } from "@/lib/store/garage";

/** Render next to the "Garage" nav label: shows the number of overdue + due-soon reminders, nothing when 0. */
export function GarageNavBadge() {
  const n = useGarageDueCount();
  if (n === 0) return null;
  return (
    <span aria-label={`${n} maintenance reminders due`} className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
      {n}
    </span>
  );
}

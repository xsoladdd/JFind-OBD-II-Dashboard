import { Button } from "@/components/ui";

/** The one-time "only where legal and safe" notice before arming the timer or the dyno (trips.perfNoticeSeen). */
export function SafetyNotice({ what, onAccept }: { what: string; onAccept: () => void }) {
  return (
    <div role="alertdialog" aria-label="Safety notice" className="space-y-4 rounded-control border border-warn/40 bg-warn-soft p-4">
      <p className="text-lg">
        Only use {what} where it&apos;s legal and safe, such as a closed course. Never on public roads. Keep your eyes on
        the road: it runs hands-free.
      </p>
      <Button variant="primary" size="drive" className="w-full" onClick={onAccept}>
        I understand, arm
      </Button>
    </div>
  );
}

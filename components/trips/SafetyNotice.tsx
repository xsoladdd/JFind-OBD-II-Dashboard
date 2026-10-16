import { btnPrimary } from "./ui";

/** The one-time "only where legal and safe" notice before arming the timer or the dyno (trips.perfNoticeSeen). */
export function SafetyNotice({ what, onAccept }: { what: string; onAccept: () => void }) {
  return (
    <div role="alertdialog" aria-label="Safety notice" className="rounded-md border border-amber-600/50 bg-amber-500/10 p-3 text-sm">
      <p className="mb-2">
        Only use {what} where it&apos;s legal and safe, such as a closed course. Never on public roads. Keep your eyes on
        the road: it runs hands-free.
      </p>
      <button className={btnPrimary} onClick={onAccept}>
        I understand, arm
      </button>
    </div>
  );
}

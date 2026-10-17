import type { ReactNode } from "react";
import { cx } from "./cx";

/** Nothing here yet: say what goes here and give the action that fills it. */
export function EmptyState({ title, children, action, className }: { title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-start gap-2 rounded-panel border border-dashed border-line px-5 py-8", className)}>
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="max-w-prose text-fg-muted">{children}</div>}
      {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

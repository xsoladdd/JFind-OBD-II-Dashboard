import { useId, type DetailsHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export const panelClass = "rounded-panel border border-line bg-surface-1";

/** The one container. Use it only when grouping needs a box; otherwise space and a heading are enough. */
export function Panel({
  title,
  action,
  className,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, "title"> & { title?: ReactNode; action?: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={title ? id : undefined} className={cx(panelClass, "p-4 sm:p-5", className)} {...rest}>
      {(title || action) && (
        <div className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-x-3">
          {title && (
            <h2 id={id} className="text-lg font-semibold">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** A collapsible section on a native <details>. "inset" nests inside a Panel or another Disclosure. */
export function Disclosure({
  summary,
  variant = "panel",
  className,
  children,
  ...rest
}: DetailsHTMLAttributes<HTMLDetailsElement> & { summary: ReactNode; variant?: "panel" | "inset" }) {
  const inset = variant === "inset";
  return (
    <details className={cx("group", inset ? "rounded-control border border-line" : panelClass, className)} {...rest}>
      <summary
        className={cx(
          "flex cursor-pointer select-none list-none items-center justify-between gap-3 rounded-[inherit] transition-colors duration-150 hover:bg-surface-2 [&::-webkit-details-marker]:hidden",
          inset ? "min-h-12 px-3 font-medium" : "min-h-14 px-4 text-lg font-semibold sm:px-5",
        )}
      >
        <span className="min-w-0">{summary}</span>
        <span aria-hidden className="shrink-0 text-sm font-medium text-fg-faint">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <div className={inset ? "px-3 pb-3" : "px-4 pb-4 sm:px-5 sm:pb-5"}>{children}</div>
    </details>
  );
}

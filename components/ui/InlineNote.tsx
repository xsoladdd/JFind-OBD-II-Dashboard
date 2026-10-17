import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type NoteTone = "info" | "warn" | "danger";

const TONE: Record<NoteTone, [box: string, title: string]> = {
  info: ["border-line bg-surface-2", "text-accent"],
  warn: ["border-warn/40 bg-warn-soft", "text-warn"],
  danger: ["border-danger/50 bg-danger-soft", "text-danger-fg"],
};

/** A message inside the page: info, a warning, or an error. Pass role="alert" only for something that just went wrong. */
export function InlineNote({
  tone = "info",
  title,
  className,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & { tone?: NoteTone; title?: ReactNode }) {
  const [box, head] = TONE[tone];
  return (
    <div className={cx("rounded-control border p-3 sm:p-4", box, className)} {...rest}>
      {title && <p className={cx("font-semibold", head)}>{title}</p>}
      {children && <div className={cx(title ? "mt-1" : "", "text-fg")}>{children}</div>}
    </div>
  );
}

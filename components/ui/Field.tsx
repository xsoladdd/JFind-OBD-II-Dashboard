"use client";

import {
  createContext,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "./cx";

const FieldCtx = createContext<{ id: string; describedBy?: string; invalid: boolean } | null>(null);

/** Label above, control, then hint and error below. Input, Select and Textarea inside pick up the id and ARIA links. */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg-muted">
        {label}
      </label>
      <FieldCtx.Provider value={{ id, describedBy: cx(hintId, errorId) || undefined, invalid: !!error }}>{children}</FieldCtx.Provider>
      {hint && (
        <p id={hintId} className="text-sm text-fg-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}

// text-base (16px) also stops iOS from zooming into a focused field.
export const inputClass =
  "block min-h-12 w-full min-w-0 rounded-control border border-line-strong bg-bg px-3 text-base text-fg placeholder:text-fg-faint hover:border-fg-faint aria-invalid:border-danger disabled:opacity-40";

function useFieldProps(p: { id?: string; "aria-describedby"?: string; "aria-invalid"?: InputHTMLAttributes<HTMLElement>["aria-invalid"] }) {
  const f = useContext(FieldCtx);
  return {
    id: p.id ?? f?.id,
    "aria-describedby": p["aria-describedby"] ?? f?.describedBy,
    "aria-invalid": p["aria-invalid"] ?? (f?.invalid || undefined),
  };
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} {...useFieldProps(rest)} className={cx(inputClass, className)} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} {...useFieldProps(rest)} className={cx(inputClass, className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} {...useFieldProps(rest)} className={cx(inputClass, "py-2", className)} />;
}

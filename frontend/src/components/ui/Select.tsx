"use client";

import type { SelectHTMLAttributes } from "react";
import { useId } from "react";

import type { Choice } from "@/lib/choices";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: Choice[];
  error?: string;
  hint?: string;
  placeholder?: string;
};

export function Select({
  label,
  options,
  error,
  hint,
  placeholder = "—",
  className = "",
  ...rest
}: Props) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`rounded border bg-surface px-3 py-2 text-sm text-ink ${
          error ? "border-bad" : "border-rule-strong"
        } ${className}`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} className="text-sm text-bad">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

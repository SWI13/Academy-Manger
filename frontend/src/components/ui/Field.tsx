"use client";

import type { InputHTMLAttributes } from "react";
import { useId } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

/**
 * A labelled input.
 *
 * The error sits next to the field it belongs to and is wired with
 * aria-describedby, because a form that reports "The submitted data is not
 * valid" at the top and nothing beside the offending box is a form people
 * guess at.
 */
export function Field({ label, error, hint, className = "", ...rest }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`rounded border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint ${
          error ? "border-bad" : "border-rule-strong"
        } ${className}`}
      />
      {error ? (
        <p id={errorId} className="text-sm text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

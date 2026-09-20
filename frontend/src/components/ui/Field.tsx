"use client";

import { useDict } from "@/components/LocaleProvider";

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";

import type { Choice } from "@/lib/choices";

import { Icon, type IconName } from "./Icon";

/*
 * Inputs, and the three things around them.
 *
 * A label above, an error or a hint below, and both wired with
 * aria-describedby - because a form that reports "The submitted data is not
 * valid" at the top and nothing beside the offending box is a form people
 * guess at.
 *
 * The control shares one height with the buttons beside it and one focus
 * treatment with every other control in the application: the ring is the
 * accent, the border goes strong, and neither moves the layout by a pixel.
 */

const CONTROL =
  "w-full rounded-md border bg-black/40 px-3 text-sm text-ink transition-[border-color,box-shadow] placeholder:text-ink-faint disabled:cursor-not-allowed disabled:bg-black/20 disabled:text-ink-faint";

function ring(error?: string) {
  return error
    ? "border-bad focus:border-bad focus:shadow-[0_0_0_3px_rgb(255_133_88/0.14)]"
    : "border-rule-strong hover:border-rule-strong hover:bg-black/50 focus:border-accent focus:shadow-[0_0_0_3px_rgb(237_28_36/0.16)]";
}

function Shell({
  id,
  label,
  error,
  hint,
  required,
  optional,
  children,
  className = "",
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const d = useDict();
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={id}
        className="flex items-baseline gap-1.5 text-[13px] font-medium text-ink"
      >
        {label}
        {required ? (
          <span className="text-bad" aria-hidden>
            *
          </span>
        ) : null}
        {optional ? (
          <span className="text-xs font-normal text-ink-faint">{d.common.optional}</span>
        ) : null}
      </label>

      {children}

      {error ? (
        <p
          id={`${id}-error`}
          className="flex items-start gap-1.5 text-[13px] text-bad"
        >
          <Icon name="alert" size={14} className="mt-px" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] leading-snug text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  /** A glyph inside the box, on the left. For search and money. */
  icon?: IconName;
  /** A fixed string on the right, e.g. the currency code. */
  suffix?: string;
  wrapperClassName?: string;
};

export function Field({
  label,
  error,
  hint,
  optional,
  icon,
  suffix,
  className = "",
  wrapperClassName = "",
  ...rest
}: FieldProps) {
  const generated = useId();
  const id = rest.id ?? generated;

  return (
    <Shell
      id={id}
      label={label}
      error={error}
      hint={hint}
      required={rest.required}
      optional={optional}
      className={wrapperClassName}
    >
      <div className="relative flex items-center">
        {icon ? (
          <Icon
            name={icon}
            size={16}
            className="pointer-events-none absolute start-3 text-ink-faint"
          />
        ) : null}
        <input
          {...rest}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
          className={`${CONTROL} ${ring(error)} h-9 ${icon ? "ps-9" : ""} ${
            suffix ? "pe-14" : ""
          } ${className}`}
        />
        {suffix ? (
          <span className="tabular pointer-events-none absolute end-3 text-xs font-medium text-ink-faint">
            {suffix}
          </span>
        ) : null}
      </div>
    </Shell>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: Choice[];
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  placeholder?: string;
  wrapperClassName?: string;
};

export function Select({
  label,
  options,
  error,
  hint,
  optional,
  placeholder = "Choose one",
  className = "",
  wrapperClassName = "",
  ...rest
}: SelectProps) {
  const generated = useId();
  const id = rest.id ?? generated;

  return (
    <Shell
      id={id}
      label={label}
      error={error}
      hint={hint}
      required={rest.required}
      optional={optional}
      className={wrapperClassName}
    >
      <div className="relative flex items-center">
        <select
          {...rest}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
          className={`${CONTROL} ${ring(error)} h-9 appearance-none pe-9 ${className}`}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon
          name="chevron-down"
          size={15}
          className="pointer-events-none absolute end-3 text-ink-faint"
        />
      </div>
    </Shell>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  wrapperClassName?: string;
};

export function TextArea({
  label,
  error,
  hint,
  optional,
  className = "",
  wrapperClassName = "",
  rows = 3,
  ...rest
}: TextAreaProps) {
  const generated = useId();
  const id = rest.id ?? generated;

  return (
    <Shell
      id={id}
      label={label}
      error={error}
      hint={hint}
      required={rest.required}
      optional={optional}
      className={wrapperClassName}
    >
      <textarea
        {...rest}
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`${CONTROL} ${ring(error)} resize-y py-2 leading-relaxed ${className}`}
      />
    </Shell>
  );
}

/**
 * A titled group of fields.
 *
 * A form of fourteen inputs in one column is a form people abandon halfway
 * down. Grouping them under headings - who they are, then what they study -
 * turns one long list into three short ones.
 */
export function FieldSet({
  legend,
  description,
  children,
  columns = 2,
}: {
  legend: string;
  description?: ReactNode;
  children: ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      {description ? (
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          {description}
        </p>
      ) : null}
      <div
        className={`mt-4 grid gap-4 ${columns === 2 ? "sm:grid-cols-2" : ""}`}
      >
        {children}
      </div>
    </fieldset>
  );
}

/**
 * The bar at the bottom of a form.
 *
 * Primary action on the left on desktop, full width and first on mobile: a
 * thumb reaches the bottom of the screen, and the submit button is what the
 * thumb is looking for.
 */
export function FormActions({
  children,
  note,
}: {
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-rule pt-5 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {children}
      </div>
      {note ? (
        <p className="text-[13px] leading-snug text-ink-faint">{note}</p>
      ) : null}
    </div>
  );
}

/**
 * A form-level failure, above the actions.
 *
 * Field errors go beside their field; this is for the ones that belong to the
 * whole submission - a conflict, a rule about two fields together, a server
 * that did not answer.
 */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-bad-line bg-bad-wash px-3 py-2.5 text-sm text-bad"
    >
      <Icon name="alert" size={16} className="mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

/** A neutral or cautionary aside inside a form or panel. */
export function Note({
  tone = "info",
  icon,
  children,
}: {
  tone?: "info" | "warn" | "ok" | "neutral";
  icon?: IconName;
  children: ReactNode;
}) {
  const tones = {
    info: "border-info-line bg-info-wash text-info",
    warn: "border-warn-line bg-warn-wash text-warn",
    ok: "border-ok-line bg-ok-wash text-ok",
    neutral: "border-rule bg-sunk text-ink-soft",
  } as const;

  const glyphs = {
    info: "info",
    warn: "alert",
    ok: "check-circle",
    neutral: "info",
  } as const;

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed ${tones[tone]}`}
    >
      <Icon name={icon ?? glyphs[tone]} size={16} className="mt-px shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

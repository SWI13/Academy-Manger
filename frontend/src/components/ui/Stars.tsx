/**
 * A rating, drawn.
 *
 * The number goes beside the stars rather than being replaced by them. Five
 * glyphs are a shape you scan; "4/5" is a value you can compare, sort by and
 * read aloud, and a screen reader gets the sentence rather than a row of
 * asterisks.
 *
 * Filled stars are the warn amber rather than a yellow of their own: a rating
 * is a signal, and this palette has one colour for "look at this".
 */
export function Stars({
  rating,
  max = 5,
  size = 14,
  showValue = true,
}: {
  rating: number;
  max?: number;
  size?: number;
  showValue?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="flex items-center gap-0.5">
        {Array.from({ length: max }, (_, index) => (
          <svg
            key={index}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            className={index < rating ? "text-warn" : "text-rule-strong"}
            fill={index < rating ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinejoin="round"
          >
            <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.8l6.5-.9L12 3Z" />
          </svg>
        ))}
      </span>
      {showValue ? (
        <span className="tabular text-xs font-medium text-ink-soft">
          {rating}/{max}
        </span>
      ) : null}
      <span className="sr-only">{`Rated ${rating} out of ${max}`}</span>
    </span>
  );
}

/**
 * A proportion, drawn as a bar.
 *
 * Used for seats taken against capacity and marks entered against a class
 * size - both of which are a ratio the reader wants at a glance and a pair of
 * numbers they want exactly. So the bar is the glance and the caption beside
 * it is the exact answer; the bar alone would be a decoration.
 */
export function Meter({
  value,
  max,
  tone = "accent",
  label,
  className = "",
}: {
  value: number;
  max: number;
  tone?: "accent" | "ok" | "warn" | "bad";
  /** Read out instead of the raw ratio. */
  label?: string;
  className?: string;
}) {
  const share = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fills = {
    accent: "bg-accent",
    ok: "bg-ok",
    warn: "bg-warn",
    bad: "bg-bad",
  } as const;

  return (
    <span
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={`block h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07] ${className}`}
    >
      <span
        /* Fills once, on arrival, then animates its width on any later change.
         A ratio that snaps into place is a ratio nobody notices arriving. */
      className={`animate-meter block h-full rounded-full transition-[width] duration-[260ms] ${fills[tone]}`}
        style={{ width: `${share}%` }}
      />
    </span>
  );
}

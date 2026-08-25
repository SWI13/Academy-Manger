/**
 * A rating, drawn.
 *
 * The number goes beside the stars rather than being replaced by them. Five
 * glyphs are a shape you scan; "4/5" is a value you can compare, sort by and
 * read aloud, and a screen reader gets the sentence rather than a row of
 * asterisks.
 */
export function Stars({
  rating,
  max = 5,
}: {
  rating: number;
  max?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="text-warn">
        {"★".repeat(rating)}
        <span className="text-ink-faint">{"★".repeat(Math.max(0, max - rating))}</span>
      </span>
      <span className="tabular text-xs text-ink-soft">
        {rating}/{max}
      </span>
      <span className="sr-only">{`Rated ${rating} out of ${max}`}</span>
    </span>
  );
}

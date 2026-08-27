"use client";

import { useId } from "react";

/**
 * The crest.
 *
 * A shield in the institute's crimson with the monogram in white, a chief
 * band across the top and a gold hairline inset from the edge. Drawn rather
 * than photographed so it stays sharp at every size and inherits the page's
 * own typeface for the letters.
 *
 * Two levels of detail, because a crest that works on a sign-in screen at
 * 96px is a smudge at 32px in a navigation rail. `detailed` adds the three
 * mullets on the chief and the gold inner line; without it the shield keeps
 * only the shapes that survive being small. The silhouette is identical
 * either way, which is the part people actually recognise.
 *
 * Colour comes from the brand tokens, so it is one crimson in both themes -
 * a heraldic red that turns pink at night is not a brand.
 *
 * A client component for one reason: `useId`. The sign-in screen draws three
 * crests, and three identical `id="crest-field"` gradients would be three
 * duplicate ids in one document. Every reference would resolve to the first
 * one and it would *look* right, which is the kind of invalid markup that
 * survives review and then breaks the day somebody changes one of them.
 */

type Props = {
  /** Pixels, tall. The shield is 7:8, so width follows. */
  size?: number;
  detailed?: boolean;
  className?: string;
  /**
   * The accessible name. Given only where the crest stands alone - beside the
   * wordmark it is decoration, and announcing it twice is noise.
   */
  title?: string;
};

export function Crest({
  size = 40,
  detailed = false,
  className = "",
  title,
}: Props) {
  const uid = useId();
  const field = `crest-field-${uid}`;
  const gloss = `crest-gloss-${uid}`;
  const clip = `crest-clip-${uid}`;

  return (
    <svg
      viewBox="0 0 48 56"
      height={size}
      width={(size * 48) / 56}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
    >
      {title ? <title>{title}</title> : null}

      <defs>
        <linearGradient id={field} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="var(--brand)" />
          <stop offset="55%" stopColor="var(--brand)" />
          <stop offset="100%" stopColor="var(--brand-deep)" />
        </linearGradient>
        <linearGradient id={gloss} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clip}>
          <path d="M8 3h32a4 4 0 0 1 4 4v21c0 12.6-8.6 21.7-20 26.2C12.6 49.7 4 40.6 4 28V7a4 4 0 0 1 4-4Z" />
        </clipPath>
      </defs>

      {/* the field */}
      <path
        d="M8 3h32a4 4 0 0 1 4 4v21c0 12.6-8.6 21.7-20 26.2C12.6 49.7 4 40.6 4 28V7a4 4 0 0 1 4-4Z"
        fill={`url(#${field})`}
      />

      {/* the chief: a white band across the top third, clipped to the shield */}
      <g clipPath={`url(#${clip})`}>
        <rect x="0" y="3" width="48" height="12.5" fill="#ffffff" />
        {detailed ? (
          <>
            {/* three mullets on the chief, in the institute's gold */}
            <g fill="var(--brand)">
              <Mullet cx={14} cy={9.25} r={2.5} />
              <Mullet cx={24} cy={9.25} r={2.5} />
              <Mullet cx={34} cy={9.25} r={2.5} />
            </g>
            {/* the gold fillet under the chief */}
            <rect
              x="0"
              y="15.5"
              width="48"
              height="1.1"
              fill="var(--brand-gold)"
            />
          </>
        ) : (
          <rect
            x="0"
            y="15.5"
            width="48"
            height="1.1"
            fill="var(--brand-gold)"
          />
        )}
      </g>

      {/* the monogram, on the field below the chief */}
      <text
        x="24"
        y="35.5"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#ffffff"
        style={{
          // The display serif when it has loaded, a serif stack until then -
          // a monogram in the body sans is a different mark entirely.
          fontFamily: "var(--font-display-face), Georgia, 'Times New Roman', serif",
          fontSize: "19px",
          letterSpacing: "0.02em",
        }}
      >
        SM
      </text>

      {detailed ? (
        <>
          {/* the gold inner line, following the shield inset by 3 */}
          <path
            d="M9 6.5h30a2 2 0 0 1 2 2v19.2c0 10.8-7.4 18.7-17 22.6-9.6-3.9-17-11.8-17-22.6V8.5a2 2 0 0 1 2-2Z"
            fill="none"
            stroke="var(--brand-gold)"
            strokeWidth="0.9"
            strokeOpacity="0.85"
          />
          {/* the base point, a small gold pile */}
          <path
            d="M24 44.5 27.4 48 24 51.4 20.6 48Z"
            fill="var(--brand-gold)"
            fillOpacity="0.9"
          />
        </>
      ) : null}

      {/* the gloss: light falling from the upper left, over everything */}
      <path
        d="M8 3h32a4 4 0 0 1 4 4v21c0 12.6-8.6 21.7-20 26.2C12.6 49.7 4 40.6 4 28V7a4 4 0 0 1 4-4Z"
        fill={`url(#${gloss})`}
      />
    </svg>
  );
}

/** A five-pointed mullet, the heraldic star. Drawn from its ten points. */
function Mullet({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const points: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? r : r * 0.42;
    // Starting at -90deg puts a point at the top, which is what makes it read
    // as a star rather than as a cog.
    const angle = (Math.PI / 5) * index - Math.PI / 2;
    points.push(
      `${(cx + radius * Math.cos(angle)).toFixed(2)},${(
        cy +
        radius * Math.sin(angle)
      ).toFixed(2)}`,
    );
  }
  return <polygon points={points.join(" ")} />;
}

/**
 * The crest with the institute's name set beside it.
 *
 * The name is the display serif and the line under it is the sans, which is
 * the whole of the typographic idea: the mark is formal, the description is
 * plain.
 */
export function Wordmark({
  size = 44,
  detailed = true,
  subtitle,
  invert = false,
  className = "",
}: {
  size?: number;
  detailed?: boolean;
  subtitle?: string;
  /** On the crimson panel, where the type is white rather than ink. */
  invert?: boolean;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-3.5 ${className}`}>
      <Crest size={size} detailed={detailed} />
      <span className="min-w-0">
        <span
          className={`block font-display text-[21px] leading-none tracking-[-0.01em] ${
            invert ? "text-white" : "text-ink"
          }`}
        >
          SM Academy
        </span>
        {subtitle ? (
          <span
            className={`mt-1.5 block text-[10.5px] font-semibold uppercase leading-none tracking-[0.16em] ${
              invert ? "text-brand-gold-soft" : "text-brand"
            }`}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}

"use client";

import { useState } from "react";

/**
 * The official SM Academy logo.
 *
 * This component *places* the official artwork. It does not draw it. There is
 * no SVG reconstruction here and there must never be one: a redrawn logo is a
 * different logo, however close, and it drifts a little further from the
 * original every time somebody tidies a path.
 *
 * ---------------------------------------------------------------------------
 * Why it is sized by height with the width left alone
 * ---------------------------------------------------------------------------
 * The one rule that matters most is that the mark is never stretched. Giving
 * the image both a width and a height is how that happens by accident - the
 * numbers stop matching the file the day somebody exports a new version with
 * a little more padding. Here the height is set and the width is `auto`, so
 * the browser derives the width from the file itself and the proportions are
 * whatever the artwork says they are. It cannot be distorted, by anyone.
 *
 * The cost is a plain <img> rather than next/image, which wants both
 * dimensions up front. For a handful of small cached PNGs that is a trade
 * worth making to remove a whole class of brand damage.
 *
 * ---------------------------------------------------------------------------
 * If the artwork is missing
 * ---------------------------------------------------------------------------
 * The fallback is the name set in the display face - never a drawn substitute
 * mark. A missing file should look like a missing file, not like a second
 * logo that somebody might mistake for approved.
 */

/** Where the official artwork lives. See `public/brand/README.md`. */
const ARTWORK = {
  /** The primary lockup: SM monogram, cap, book, ACADEMY. Transparent PNG. */
  lockup: "/brand/sm-academy.png",
  /** The extended lockup: disciplines strip and tagline beneath. */
  extended: "/brand/sm-academy-full.png",
  /** A square crop of the mark, for spaces too narrow for the wordmark. */
  icon: "/brand/icon.png",
} as const;

type Variant = keyof typeof ARTWORK;

type Props = {
  /**
   * Height in pixels. The only dimension given - width follows the artwork.
   */
  height?: number;
  variant?: Variant;
  /**
   * The sign-in screen and the splash show the logo above the fold, so those
   * two ask for it eagerly. Everywhere else it can wait its turn.
   */
  priority?: boolean;
  className?: string;
  /**
   * The accessible name. Give it where the logo is the only thing naming the
   * page or the product; leave it off where the name is written beside it,
   * since announcing it twice is noise.
   */
  title?: string;
};

export function Logo({
  height = 40,
  variant = "lockup",
  priority = false,
  className = "",
  title,
}: Props) {
  const [missing, setMissing] = useState(false);

  if (missing) return <LogoFallback height={height} className={className} />;

  /*
   * The <img> is deliberate; see the note at the top of the file. next/image
   * requires an explicit width, and an explicit width is how a logo gets
   * stretched. The rule is suppressed for that reason and no other.
   */
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={(node) => {
        /*
         * A <img> that 404s during server-rendered HTML has already failed by
         * the time React attaches onError, so the handler alone leaves the
         * browser's broken-image glyph on the page. `complete` with a zero
         * natural width is what a failed decode looks like after the fact.
         */
        if (node?.complete && node.naturalWidth === 0) setMissing(true);
      }}
      src={ARTWORK[variant]}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      style={{ height }}
      className={`w-auto max-w-full select-none ${className}`}
      draggable={false}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setMissing(true)}
    />
  );
}

/**
 * The name, set in type, for when the artwork cannot be loaded.
 *
 * Deliberately plain. It is a placeholder that says "the logo is missing",
 * which is exactly the message somebody needs in order to go and fix it.
 */
function LogoFallback({
  height,
  className = "",
}: {
  height: number;
  className?: string;
}) {
  /*
   * The caller's className goes on the outer span, which carries no display
   * utility of its own, and the layout lives on an inner one.
   *
   * Because the caller's className is how the sign-in screen writes
   * `hidden lg:block` to pick between two sizes - and `hidden` and
   * `inline-flex` on the same element are two rules of equal specificity
   * settled by their order in the stylesheet, not by their order in the
   * attribute. Putting them on the same span rendered both logos at once on
   * a phone.
   */
  return (
    <span className={className}>
      <span
        style={{ fontSize: Math.round(height * 0.44), lineHeight: 1 }}
        className="display inline-flex max-w-full select-none items-baseline gap-[0.3em] overflow-hidden whitespace-nowrap italic tracking-tight text-ink"
      >
        <span className="text-accent">SM</span>
        <span>ACADEMY</span>
      </span>
    </span>
  );
}

/**
 * The logo with a line of context under it - a section name, a role, a portal
 * name. The rule between them is the brand red, which is the one place the
 * interface is allowed to put a red line directly beneath the mark.
 */
export function LogoLockup({
  height = 44,
  caption,
  priority = false,
  className = "",
  title,
}: Props & { caption?: string }) {
  return (
    <span className={`inline-flex flex-col items-start ${className}`}>
      <Logo height={height} priority={priority} title={title} />
      {caption ? (
        <>
          <span
            aria-hidden
            className="fx-rule mt-2.5 block h-px w-full min-w-24"
          />
          <span className="eyebrow mt-2 block text-ink-soft">{caption}</span>
        </>
      ) : null}
    </span>
  );
}

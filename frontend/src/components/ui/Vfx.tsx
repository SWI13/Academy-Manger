/**
 * The atmosphere layer.
 *
 * One component for every background effect in the application, so the
 * question "how much is too much" is answered once, in three settings,
 * instead of being re-litigated on every screen.
 *
 *   1  minimal   - forms, tables, settings, anything data-heavy. A grid so
 *                  faint it reads as texture, and nothing that moves.
 *   2  moderate  - dashboards, detail pages, card grids. The grid, a single
 *                  pool of red light, a trace of circuitry.
 *   3  strong    - the sign-in screen. Two drifting pools, the circuit tile,
 *                  and one beam that crosses every twenty-six seconds.
 *
 * Everything it renders is `aria-hidden`, `pointer-events-none` and
 * absolutely positioned behind its siblings. Delete any instance of it and
 * the page underneath is unchanged - which is the property that makes it safe
 * to switch the whole thing off on a modest device.
 *
 * The parent must establish a stacking context (`relative isolate`) and clip
 * (`overflow-hidden`), or the pools will paint over the page.
 */

type Props = {
  level?: 1 | 2 | 3;
  /**
   * Pinned to the viewport rather than to the parent. For the signed-in
   * shell, where the workspace scrolls: an absolute layer would scroll its
   * glow off the top of a long roster and leave the rest of the page flat.
   */
  fixed?: boolean;
  /** Extra positioning, e.g. a hero strip that is not the whole page. */
  className?: string;
};

export function Vfx({ level = 2, fixed = false, className = "" }: Props) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none -z-10 overflow-hidden ${
        fixed ? "fixed inset-0" : "absolute inset-0"
      } ${className}`}
    >
      {/* The grid, on every level. It is what makes black read as a surface
          rather than as an absence. */}
      <div className="fx-grid absolute inset-0" />

      {level >= 2 ? (
        <>
          {/* Circuitry, tiled, at the top where headings sit over it. */}
          <div className="fx-circuit absolute inset-x-0 top-0 h-72 opacity-40" />

          {/* One pool of red, upper right, behind the page title. `fx-soft`
              marks it as a blur that a modest device may drop. */}
          <div
            className={`fx-glow fx-soft absolute -right-40 -top-48 size-[34rem] rounded-full blur-3xl ${
              level === 3 ? "animate-drift" : ""
            }`}
          />
        </>
      ) : null}

      {level >= 3 ? (
        <>
          {/* A second, cooler pool low on the opposite side, so the field has
              a direction to it rather than one hot corner. */}
          <div className="fx-glow-white fx-soft animate-drift-slow absolute -bottom-56 -left-40 size-[30rem] rounded-full blur-3xl" />

          {/* The beam. One diagonal band of light crossing the panel. */}
          <div className="animate-beam absolute -inset-y-1/4 left-0 w-40 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
        </>
      ) : null}

      {/* A vignette, always. It pulls the eye back to the middle and hides
          the point where the grid mask runs out. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgb(0_0_0/0.55)_100%)]" />
    </div>
  );
}

/**
 * The red hairline that runs under a page title.
 *
 * Small enough to be a utility, common enough to be worth naming: a short
 * solid segment in the brand red fading to nothing, which is the same shape
 * as the red underline in the logo's own wordmark.
 */
export function BrandRule({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`fx-rule block h-px ${className}`} />;
}

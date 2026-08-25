/**
 * Loading states shaped like the thing that is loading.
 *
 * A spinner in the middle of a page says "wait" and nothing else; the layout
 * then arrives all at once and everything moves. These match the final
 * geometry closely enough that the real content lands in the space its
 * skeleton was holding, so the page settles rather than reflows.
 *
 * Every block is aria-hidden inside a container marked busy, so a screen
 * reader hears "loading" once rather than reading out forty empty boxes.
 */

export function Skeleton({
  className = "",
  width,
}: {
  className?: string;
  width?: string | number;
}) {
  return (
    <span
      aria-hidden
      className={`skeleton block h-4 ${className}`}
      style={width ? { width } : undefined}
    />
  );
}

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div role="status" aria-busy aria-live="polite" className="animate-fade">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A row of stat tiles, at the count the real dashboard will render. */
export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <Frame label="Loading figures">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            className="rounded-xl border border-rule bg-surface p-4 shadow-xs"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** A table, header included, at a plausible row count. */
export function SkeletonTable({
  rows = 6,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <Frame label="Loading rows">
      <div className="overflow-hidden rounded-xl border border-rule bg-surface shadow-xs">
        <div className="flex gap-4 border-b border-rule bg-sunk/40 px-4 py-2.5">
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div
            key={row}
            className="flex items-center gap-4 border-b border-rule px-4 py-3.5 last:border-b-0"
          >
            {Array.from({ length: columns }, (_, column) => (
              <Skeleton
                key={column}
                className={`h-4 flex-1 ${column === 0 ? "max-w-44" : ""}`}
              />
            ))}
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** A stack of cards - reviews, notifications, audit entries. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <Frame label="Loading">
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="rounded-xl border border-rule bg-surface p-4 shadow-xs"
          >
            <div className="flex items-start justify-between gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** The page title block, so the header does not pop in after the body. */
export function SkeletonHeader({ lede = true }: { lede?: boolean }) {
  return (
    <Frame label="Loading page">
      <div>
        <Skeleton className="h-7 w-52" />
        {lede ? <Skeleton className="mt-3 h-3.5 w-full max-w-lg" /> : null}
      </div>
    </Frame>
  );
}

/** A detail page: a description list of label/value pairs. */
export function SkeletonDetail({ items = 6 }: { items?: number }) {
  return (
    <Frame label="Loading details">
      <div className="rounded-xl border border-rule bg-surface p-5 shadow-xs">
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {Array.from({ length: items }, (_, index) => (
            <div key={index}>
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="mt-2 h-4 w-36" />
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/** The week grid, which is seven columns whatever is in it. */
export function SkeletonWeek() {
  return (
    <Frame label="Loading the schedule">
      <div className="overflow-hidden rounded-xl border border-rule bg-surface shadow-xs">
        <div className="grid grid-cols-7 divide-x divide-rule">
          {Array.from({ length: 7 }, (_, day) => (
            <div key={day} className="min-w-0">
              <div className="border-b border-rule px-3 py-2.5">
                <Skeleton className="h-3 w-10" />
              </div>
              <div className="flex flex-col gap-2 p-2">
                {Array.from({ length: (day % 3) + 1 }, (_, slot) => (
                  <Skeleton key={slot} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

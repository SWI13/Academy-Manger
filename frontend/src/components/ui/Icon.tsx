import type { SVGProps } from "react";

/**
 * One icon set, drawn to one grid.
 *
 * Every glyph is a 24x24 outline on the same 1.75 stroke with round caps and
 * joins, so a bell beside a chevron beside a badge tick all read as members
 * of the same family. Mixing two icon libraries is the fastest way to make an
 * otherwise careful interface look assembled from parts.
 *
 * They are paths rather than a package for a plain reason: an icon font or a
 * component library ships a thousand glyphs to render the thirty this
 * application uses, and every one of them arrives before the first row of the
 * table does.
 *
 * Icons here are decoration by default - `aria-hidden`, with the meaning
 * carried by the text beside them. An icon that is the only label gets a
 * `title`, which turns it into an image with an accessible name.
 */

export type IconName =
  | "activity"
  | "alert"
  | "archive"
  | "arrow-left"
  | "arrow-right"
  | "arrow-up-right"
  | "bell"
  | "book"
  | "calendar"
  | "card"
  | "check"
  | "check-circle"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "clock"
  | "close"
  | "download"
  | "external"
  | "eye"
  | "file"
  | "filter"
  | "gauge"
  | "bolt"
  | "car"
  | "chip"
  | "code"
  | "network"
  | "wrench"
  | "graduation"
  | "info"
  | "key"
  | "layers"
  | "loader"
  | "lock"
  | "logout"
  | "mail"
  | "menu"
  | "minus"
  | "phone"
  | "pin"
  | "plus"
  | "receipt"
  | "search"
  | "settings"
  | "shield"
  | "sparkle"
  | "star"
  | "trend-down"
  | "trend-up"
  | "upload"
  | "user"
  | "user-plus"
  | "users"
  | "wallet";

/** Path data only. Everything else - size, stroke, colour - is set once below. */
const PATHS: Record<IconName, string> = {
  activity: "M3 12h4l3 8 4-16 3 8h4",
  alert: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  archive: "M3 8h18M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M3 4h18v4H3zM10 12h4",
  "arrow-left": "M19 12H5m0 0 6-6m-6 6 6 6",
  "arrow-right": "M5 12h14m0 0-6-6m6 6-6 6",
  "arrow-up-right": "M7 17 17 7m0 0H8m9 0v9",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z",
  calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  card: "M2 10h20M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2 9h4",
  check: "M20 6 9 17l-5-5",
  "check-circle": "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-left": "m15 18-6-6 6-6",
  "chevron-right": "m9 18 6-6-6-6",
  clock: "M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  close: "M18 6 6 18M6 6l12 12",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  external: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6",
  filter: "M3 5h18l-7 8v6l-4 2v-8L3 5Z",
  gauge: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm2.1-2.9L18 8M4.2 17A9.5 9.5 0 0 1 12 2.5 9.5 9.5 0 0 1 19.8 17",

  /*
   * The trades the academy teaches.
   *
   * Drawn to the same 24 grid and the same 1.75 stroke as everything else, so
   * a wrench beside a bell reads as one family. They label course categories
   * and nothing else - a spanner is a category, never a settings menu.
   */
  wrench:
    "M15.6 3.4a5.2 5.2 0 0 0-6.6 6.6l-5.4 5.4a2 2 0 0 0 0 2.8l1.8 1.8a2 2 0 0 0 2.8 0l5.4-5.4a5.2 5.2 0 0 0 6.6-6.6l-3.2 3.2-2.9-.7-.7-2.9 3.2-3.2Z",
  bolt: "M13.5 2 5 13.5h5.6L9.9 22l8.6-11.5h-5.7l.7-8.5Z",
  car: "M3.5 16.5v-4a2 2 0 0 1 .21-.9l1.9-3.8A2 2 0 0 1 7.4 6.7h9.2a2 2 0 0 1 1.79 1.1l1.9 3.8a2 2 0 0 1 .21.9v4M3.5 16.5h17M3.5 16.5v2.3M20.5 16.5v2.3M6.8 13h2M15.2 13h2",
  chip: "M6.8 6.8h10.4v10.4H6.8zM9.6 3.4v3.4M14.4 3.4v3.4M9.6 17.2v3.4M14.4 17.2v3.4M3.4 9.6h3.4M3.4 14.4h3.4M17.2 9.6h3.4M17.2 14.4h3.4",
  code: "m8.4 8-4.6 4 4.6 4M15.6 8l4.6 4-4.6 4M13.6 4.6 10.4 19.4",
  network:
    "M12 3.4a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4ZM5 16.2a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4ZM19 16.2a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4ZM12 7.8v3.7M6.1 11.5h11.8a1 1 0 0 1 1 1v3.7M5 16.2v-3.7a1 1 0 0 1 1-1",
  graduation: "M22 9 12 5 2 9l10 4 10-4Zm-16 3v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5",
  info: "M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  key: "m15.5 8.5 5 5M14 15l3-3M9.5 20a6.5 6.5 0 1 1 4.6-11.1L21 15.8 18.8 18l-2.2-2.2-2.2 2.2-2-2A6.5 6.5 0 0 1 9.5 20Z",
  layers: "m12 2 9 5-9 5-9-5 9-5Zm9 10-9 5-9-5m18 5-9 5-9-5",
  loader: "M12 2v4m0 12v4M4.9 4.9l2.9 2.9m8.4 8.4 2.9 2.9M2 12h4m12 0h4M4.9 19.1l2.9-2.9m8.4-8.4 2.9-2.9",
  lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9",
  mail: "m3 7 9 6 9-6M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  menu: "M3 6h18M3 12h18M3 18h18",
  minus: "M5 12h14",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z",
  pin: "M12 21s-7-5.7-7-11a7 7 0 1 1 14 0c0 5.3-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  plus: "M12 5v14M5 12h14",
  receipt: "M4 2v20l2.5-1.5L9 22l2.5-1.5L14 22l2.5-1.5L19 22V2l-2.5 1.5L14 2l-2.5 1.5L9 2 6.5 3.5 4 2Zm4 6h8M8 12h8M8 16h5",
  search: "m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 2h-4l-.4 2.6c-.7.3-1.4.7-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c0-.4.1-.8.1-1.2Z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-4",
  sparkle: "m12 3 2.1 5.4L19.5 10l-5.4 2.1L12 17.5l-2.1-5.4L4.5 10l5.4-1.6L12 3Zm7 11 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z",
  star: "m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.8l6.5-.9L12 3Z",
  "trend-down": "M22 17 13.5 8.5l-5 5L2 7m20 10h-6m6 0v-6",
  "trend-up": "M22 7 13.5 15.5l-5-5L2 17M22 7h-6m6 0v6",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5m5-5v12",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  "user-plus": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11-3v6m3-3h-6",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7.5-7.7a4 4 0 0 1 0 7.4M23 21v-2a4 4 0 0 0-3-3.9",
  wallet:
    "M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5m13 7h.01",
};

type Props = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  /** Pixels. Sizes are 14, 16, 18 or 20 in practice; 16 is the row default. */
  size?: number;
  /** Give an icon that stands alone an accessible name. */
  title?: string;
};

export function Icon({ name, size = 16, title, className = "", ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The spinner, which is the loader glyph turning. Used by buttons and pollers. */
export function Spinner({
  size = 14,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

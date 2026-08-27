import { ROLE_LABELS, type RoleCode } from "@/lib/permissions";

/**
 * Initials, tinted by identifier.
 *
 * No photographs anywhere in this platform - there is no upload for one and
 * no field to hold it - so the avatar's whole job is to give a row a stable
 * anchor for the eye. The tint is derived from the public ID, which means the
 * same person is the same colour on every screen and in every list.
 *
 * Five tints, and every one of them is red or grey.
 *
 * They used to borrow the status colours - a green tint, an amber one - which
 * put a green disc beside a green APPROVED badge in the same row and made
 * colour look like it meant something here. It does not. An avatar is a place
 * for the eye to land, so the set is now the brand red at two strengths and
 * the neutral at three, and the status badge is left as the only thing on a
 * row that carries a meaning in its colour.
 */
const TINTS = [
  "bg-accent-soft text-accent border border-accent-line",
  "bg-white/[0.07] text-ink border border-rule-strong",
  "bg-[rgb(237_28_36/0.05)] text-[#ff8a8a] border border-[rgb(237_28_36/0.18)]",
  "bg-white/[0.03] text-ink-soft border border-rule",
  "bg-black/50 text-ink-faint border border-rule",
] as const;

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-9 text-[13px]",
  lg: "size-12 text-base",
  xl: "size-16 text-xl",
} as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tintFor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return TINTS[hash % TINTS.length];
}

export function Avatar({
  name,
  seed,
  size = "md",
  className = "",
}: {
  name: string;
  /** The public ID. Falls back to the name, which is less stable. */
  seed?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${tintFor(
        seed ?? name,
      )} ${SIZES[size]} ${className}`}
    >
      {initials(name)}
    </span>
  );
}

/**
 * The avatar plus the two lines that always sit beside it.
 *
 * Name, then identifier - in that order everywhere, because a table where the
 * ID is on top in one column set and underneath in another is a table people
 * misread under time pressure.
 */
export function PersonCell({
  name,
  publicId,
  role,
  size = "sm",
}: {
  name: string;
  publicId?: string | null;
  role?: RoleCode | string | null;
  size?: keyof typeof SIZES;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={name} seed={publicId ?? name} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{name}</span>
        {publicId || role ? (
          <span className="tabular block truncate text-xs text-ink-faint">
            {publicId}
            {publicId && role ? " · " : ""}
            {role ? (ROLE_LABELS[role as RoleCode] ?? role) : ""}
          </span>
        ) : null}
      </span>
    </span>
  );
}

import { LinkButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * Not found - which here means one of two things, and deliberately does not
 * say which.
 *
 * The record may not exist, or it may exist and be outside this caller's
 * scope. The API answers 404 to both, because a 403 on a sequential reference
 * like PAY-000004 confirms that PAY-000004 is real. This screen keeps that
 * ambiguity rather than helpfully undoing it.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <span
        aria-hidden
        className="mb-4 flex size-12 items-center justify-center rounded-full border border-rule bg-white/[0.06] text-ink-faint"
      >
        <Icon name="search" size={22} />
      </span>

      <h1 className="text-lg font-semibold text-ink">Not found</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
        There is no record here for you. Either it does not exist, or it is not
        one your role can reach — and the platform does not distinguish between
        those two on purpose.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <LinkButton href="/dashboard" variant="primary" icon="gauge">
          Back to the dashboard
        </LinkButton>
      </div>
    </div>
  );
}

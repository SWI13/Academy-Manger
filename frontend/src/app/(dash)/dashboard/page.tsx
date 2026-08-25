import { StatTile } from "@/components/ui/StatTile";
import { getJson } from "@/lib/django";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { ROLE_LABELS, type RoleCode } from "@/lib/permissions";
import { cookieHeader } from "@/lib/session";

export const metadata = { title: "Dashboard · SM Academy" };

/**
 * Every field optional, and that is the design.
 *
 * The dashboard endpoint composes its response from the caller's permissions,
 * so a receptionist's payload contains no revenue key at all. This page
 * renders a tile when its number arrived and skips it otherwise. There is no
 * `can("report.view_financial")` check here, because there is nothing to
 * hide - a figure the API never sent cannot be found in the network tab
 * either.
 */
type Dashboard = {
  role: RoleCode;

  students_total?: number;
  students_active?: number;
  professors_total?: number;
  reception_total?: number;
  admins_total?: number;

  courses_active?: number;
  courses_completed?: number;
  courses_draft?: number;
  enrolments_live?: number;

  revenue_total_minor?: number;
  revenue_this_month_minor?: number;
  pending_amount_minor?: number;
  pending_count?: number;
  outstanding_minor?: number;
  currency?: string;

  enrolments_today?: number;
  payments_recorded_today?: number;
  payments_awaiting_review?: number;

  reviews_awaiting_moderation?: number;

  my_courses?: number;
  my_students?: number;
  assessments_unmarked?: number;
  next_session?: {
    course_public_id: string;
    course_title: string;
    starts_at: string;
    room: string;
    enrolled_count: number;
  } | null;

  total_minor?: number;
  paid_minor?: number;
  remaining_minor?: number;
};

function has(value: unknown): boolean {
  return value !== undefined && value !== null;
}

export default async function DashboardPage() {
  const data = await getJson<Dashboard>(
    "/api/v1/reports/dashboard/",
    await cookieHeader(),
  );

  if (!data) {
    return (
      <p className="text-sm text-ink-soft">
        The dashboard could not be loaded. Try refreshing.
      </p>
    );
  }

  const currency = data.currency ?? "DZD";

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {ROLE_LABELS[data.role]} view.
        </p>
      </header>

      {data.next_session ? (
        <section
          aria-label="Your next session"
          className="rounded border border-accent/30 bg-accent-soft p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            Next session
          </p>
          <p className="mt-2 text-lg font-medium text-ink">
            {data.next_session.course_title}
          </p>
          <p className="tabular mt-1 text-sm text-ink-soft">
            {formatDateTime(data.next_session.starts_at)}
            {data.next_session.room ? ` · ${data.next_session.room}` : ""} ·{" "}
            {formatNumber(data.next_session.enrolled_count)} enrolled
          </p>
        </section>
      ) : null}

      <Group title="People">
        {has(data.students_active) && (
          <StatTile
            label="Active students"
            value={formatNumber(data.students_active)}
            note={`${formatNumber(data.students_total)} on record`}
          />
        )}
        {has(data.professors_total) && (
          <StatTile
            label="Professors"
            value={formatNumber(data.professors_total)}
          />
        )}
        {has(data.reception_total) && (
          <StatTile label="Reception" value={formatNumber(data.reception_total)} />
        )}
        {has(data.admins_total) && (
          <StatTile label="Administrators" value={formatNumber(data.admins_total)} />
        )}
      </Group>

      <Group title="Teaching">
        {has(data.courses_active) && (
          <StatTile
            label="Active courses"
            value={formatNumber(data.courses_active)}
            note={`${formatNumber(data.courses_draft)} draft · ${formatNumber(
              data.courses_completed,
            )} finished`}
          />
        )}
        {has(data.enrolments_live) && (
          <StatTile
            label="Live enrolments"
            value={formatNumber(data.enrolments_live)}
          />
        )}
        {has(data.my_courses) && (
          <StatTile label="My courses" value={formatNumber(data.my_courses)} />
        )}
        {has(data.my_students) && (
          <StatTile label="My students" value={formatNumber(data.my_students)} />
        )}
        {has(data.assessments_unmarked) && (
          <StatTile
            label="Assessments unmarked"
            value={formatNumber(data.assessments_unmarked)}
            tone={data.assessments_unmarked ? "warn" : "plain"}
          />
        )}
      </Group>

      <Group title="Money">
        {has(data.revenue_this_month_minor) && (
          <StatTile
            label="Collected this month"
            value={formatMoney(data.revenue_this_month_minor, currency)}
            note={`${formatMoney(data.revenue_total_minor, currency)} all time`}
            tone="ok"
          />
        )}
        {has(data.pending_amount_minor) && (
          <StatTile
            label="Awaiting approval"
            value={formatMoney(data.pending_amount_minor, currency)}
            note={`${formatNumber(data.pending_count)} payments`}
            tone={data.pending_count ? "warn" : "plain"}
          />
        )}
        {has(data.outstanding_minor) && (
          <StatTile
            label="Outstanding"
            value={formatMoney(data.outstanding_minor, currency)}
            note="Contracted minus approved, over live enrolments"
          />
        )}
        {has(data.remaining_minor) && (
          <StatTile
            label="You still owe"
            value={formatMoney(data.remaining_minor, currency)}
            note={`${formatMoney(data.paid_minor, currency)} paid of ${formatMoney(
              data.total_minor,
              currency,
            )}`}
            tone={data.remaining_minor ? "warn" : "ok"}
          />
        )}
      </Group>

      <Group title="Today">
        {has(data.enrolments_today) && (
          <StatTile
            label="Enrolments today"
            value={formatNumber(data.enrolments_today)}
          />
        )}
        {has(data.payments_recorded_today) && (
          <StatTile
            label="Payments recorded today"
            value={formatNumber(data.payments_recorded_today)}
          />
        )}
        {has(data.payments_awaiting_review) && (
          <StatTile
            label="Payments awaiting review"
            value={formatNumber(data.payments_awaiting_review)}
            tone={data.payments_awaiting_review ? "warn" : "plain"}
          />
        )}
        {has(data.reviews_awaiting_moderation) && (
          <StatTile
            label="Reviews to moderate"
            value={formatNumber(data.reviews_awaiting_moderation)}
            tone={data.reviews_awaiting_moderation ? "warn" : "plain"}
          />
        )}
      </Group>
    </div>
  );
}

/** A titled row of tiles, which disappears entirely when it holds none. */
function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const tiles = Array.isArray(children)
    ? children.flat().filter(Boolean)
    : [children].filter(Boolean);
  if (!tiles.length) return null;

  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{tiles}</div>
    </section>
  );
}

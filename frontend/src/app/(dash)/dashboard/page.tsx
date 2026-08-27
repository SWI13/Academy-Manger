import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card, SectionHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/EmptyState";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Stars";
import { Figure, StatTile } from "@/components/ui/StatTile";
import { getJson } from "@/lib/django";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { ROLE_LABELS, type Permission, type RoleCode } from "@/lib/permissions";
import { can, cookieHeader, getSession } from "@/lib/session";

export const metadata = { title: "Dashboard" };

/**
 * Every field optional, and that is the design.
 *
 * The dashboard endpoint composes its response from the caller's permissions,
 * so a receptionist's payload contains no revenue key at all. This page
 * renders a tile when its number arrived and skips it otherwise. There is no
 * `can("report.view_financial")` check over a figure, because there is
 * nothing to hide - a number the API never sent cannot be found in the
 * network tab either.
 *
 * What the *shape* of the page depends on is the role, and only for ordering:
 * an owner opens this to see the institute, a professor to see what is next,
 * a student to see themselves. Every figure in every arrangement still comes
 * from the same payload.
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

/** Morning, afternoon or evening, from the server's clock. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const [data, session] = await Promise.all([
    getJson<Dashboard>("/api/v1/reports/dashboard/", await cookieHeader()),
    getSession(),
  ]);

  if (!data || !session) {
    return (
      <ErrorState
        title="The dashboard could not be loaded"
        description="The figures did not come back from the server. Refreshing usually settles it."
      />
    );
  }

  const currency = data.currency ?? "DZD";
  const first = session.first_name || session.full_name.split(" ")[0];
  const isStudent = data.role === "STUDENT";

  return (
    <div className="flex flex-col gap-8">
      {/*
        The one hero on the signed-in side of the application. Everything in
        it is either the person's own name or a sentence about what they are
        looking at - there is no figure here that the tiles below do not also
        carry, because a hero that invents a number is a hero that can be
        wrong in a place nobody thinks to check.
      */}
      <header className="glass relative isolate overflow-hidden rounded-xl border border-rule px-5 py-6 sm:px-7 sm:py-7">
        <span aria-hidden className="fx-grid-fine absolute inset-0 -z-10 opacity-70" />
        <span
          aria-hidden
          className="fx-glow fx-soft absolute -right-24 -top-28 -z-10 size-72 rounded-full blur-3xl"
        />
        {/* Hazard hatching along the top edge - the workshop marking that
            says "this is equipment", carried into the interface. */}
        <span aria-hidden className="fx-hatch absolute inset-x-0 top-0 h-[3px]" />

        <p className="eyebrow text-accent">{ROLE_LABELS[session.primary_role]}</p>
        <h1 className="mt-2 text-2xl font-semibold text-white sm:text-[30px]">
          {greeting()}, {first}
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          {blurb(data)}
        </p>
      </header>

      {/* --- the professor's one question: what is next ----------------- */}
      {data.next_session ? <NextSession session={data.next_session} /> : null}

      {/* --- the student's own money, before anything else -------------- */}
      {isStudent && has(data.remaining_minor) ? (
        <StudentBalance data={data} currency={currency} />
      ) : null}

      {/* --- attention: things waiting on somebody --------------------- */}
      <Attention data={data} currency={currency} />

      {/* --- the institute --------------------------------------------- */}
      <Group title="Money" note="Approved payments only. Pending money is not revenue yet.">
        {has(data.revenue_this_month_minor) && (
          <StatTile
            label="Collected this month"
            value={formatMoney(data.revenue_this_month_minor, currency)}
            note={`${formatMoney(data.revenue_total_minor, currency)} all time`}
            tone="ok"
            icon="trend-up"
          />
        )}
        {has(data.outstanding_minor) && (
          <StatTile
            label="Outstanding"
            value={formatMoney(data.outstanding_minor, currency)}
            note="Contracted minus approved, over live enrolments"
            icon="receipt"
            href="/reports?report=outstanding"
          />
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
            icon="book"
            href="/courses?status=ACTIVE"
          />
        )}
        {has(data.enrolments_live) && (
          <StatTile
            label="Live enrolments"
            value={formatNumber(data.enrolments_live)}
            icon="graduation"
            href="/enrollments?status=ACTIVE"
          />
        )}
        {has(data.my_courses) && (
          <StatTile
            label={isStudent ? "Your courses" : "My courses"}
            value={formatNumber(data.my_courses)}
            icon="book"
            href="/courses"
          />
        )}
        {has(data.my_students) && (
          <StatTile
            label="My students"
            value={formatNumber(data.my_students)}
            icon="users"
            href="/enrollments"
          />
        )}
      </Group>

      <Group title="People">
        {has(data.students_active) && (
          <StatTile
            label="Active students"
            value={formatNumber(data.students_active)}
            note={`${formatNumber(data.students_total)} on record`}
            icon="graduation"
            href="/users?role=STUDENT&status=ACTIVE"
          />
        )}
        {has(data.professors_total) && (
          <StatTile
            label="Professors"
            value={formatNumber(data.professors_total)}
            icon="user"
            href="/users?role=PROFESSOR"
          />
        )}
        {has(data.reception_total) && (
          <StatTile
            label="Reception"
            value={formatNumber(data.reception_total)}
            icon="users"
            href="/users?role=RECEPTION"
          />
        )}
        {has(data.admins_total) && (
          <StatTile
            label="Administrators"
            value={formatNumber(data.admins_total)}
            icon="shield"
            href="/users?role=ADMIN"
          />
        )}
      </Group>

      <Group title="Today">
        {has(data.enrolments_today) && (
          <StatTile
            label="Enrolments today"
            value={formatNumber(data.enrolments_today)}
            icon="user-plus"
            href="/enrollments"
          />
        )}
        {has(data.payments_recorded_today) && (
          <StatTile
            label="Payments recorded today"
            value={formatNumber(data.payments_recorded_today)}
            icon="receipt"
            href="/payments"
          />
        )}
      </Group>

      <QuickActions session={session} role={data.role} />
    </div>
  );
}

/** The sentence under the greeting, which differs by what this person does. */
function blurb(data: Dashboard): string {
  switch (data.role) {
    case "STUDENT":
      return "Your courses, marks and payments in one place.";
    case "PROFESSOR":
      return "What is next, and what is still waiting to be marked.";
    case "RECEPTION":
      return "Today at the desk — enrolments, payments and the approval queue.";
    case "ADMIN":
      return "Operations across the institute.";
    default:
      return "Here is what is happening at SM Academy today.";
  }
}

/**
 * The panel a professor opens this page for.
 *
 * The next occurrence is worked out by the backend from the weekly pattern -
 * there is no dated-session table to read - so everything here is a field of
 * `next_session` and nothing is derived in the browser.
 */
function NextSession({
  session,
}: {
  session: NonNullable<Dashboard["next_session"]>;
}) {
  return (
    <Card className="relative overflow-hidden border-accent-line bg-accent-soft">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-accent/10 blur-2xl"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.055em] text-accent">
            <Icon name="clock" size={13} />
            Next class
          </p>
          <p className="mt-2.5 text-xl font-semibold text-ink">
            {session.course_title}
          </p>
          <p className="tabular mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="calendar" size={14} className="text-ink-faint" />
              {formatDateTime(session.starts_at)}
            </span>
            {session.room ? (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="pin" size={14} className="text-ink-faint" />
                {session.room}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Icon name="users" size={14} className="text-ink-faint" />
              {formatNumber(session.enrolled_count)} enrolled
            </span>
          </p>
        </div>
        <Link
          href={`/courses/${session.course_public_id}`}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-accent-fill px-4 text-sm font-medium text-accent-ink shadow-xs transition-colors hover:bg-accent-fill-hover"
        >
          Open class
          <Icon name="arrow-right" size={15} />
        </Link>
      </div>
    </Card>
  );
}

/**
 * A student's balance, as three figures that are never added together here.
 *
 * `remaining` is the backend's number, not `total - paid` computed in the
 * browser. The bar is drawn from paid over total, which is a proportion of
 * two figures the API sent rather than a new amount of money.
 */
function StudentBalance({
  data,
  currency,
}: {
  data: Dashboard;
  currency: string;
}) {
  const settled = (data.remaining_minor ?? 0) === 0;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Your balance</p>
          <p
            className={`tabular mt-2 text-3xl font-semibold tracking-tight ${
              settled ? "text-ok" : "text-ink"
            }`}
          >
            {formatMoney(data.remaining_minor, currency)}
          </p>
          <p className="mt-1.5 text-sm text-ink-soft">
            {settled ? "Nothing outstanding. You are all paid up." : "Still to pay"}
          </p>
        </div>
        <Badge tone={settled ? "ok" : "warn"} dot>
          {settled ? "Settled" : "Outstanding"}
        </Badge>
      </div>

      <div className="mt-5 border-t border-rule pt-4">
        <Meter
          value={data.paid_minor ?? 0}
          max={data.total_minor ?? 0}
          /*
           * Green whether or not the balance is settled. The bar measures
           * money *received*, and the figure directly beneath it - "Paid" -
           * is green too; a red fill under a green number reads as an alarm
           * about the part that already went right. The "Outstanding" badge
           * above carries the warning, which is where it belongs.
           */
          tone="ok"
          label={`${formatMoney(data.paid_minor, currency)} paid of ${formatMoney(
            data.total_minor,
            currency,
          )}`}
        />
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Figure
            label="Agreed"
            value={formatMoney(data.total_minor, currency)}
          />
          <Figure
            label="Paid"
            value={formatMoney(data.paid_minor, currency)}
            tone="ok"
          />
          <Figure
            label="Remaining"
            value={formatMoney(data.remaining_minor, currency)}
            tone={settled ? "ok" : "warn"}
          />
        </div>
      </div>
    </Card>
  );
}

/**
 * The queue: things that are waiting for a person rather than for time.
 *
 * These get their own band above the counts because they are the only figures
 * on the page that are actionable. A pending payment is somebody's afternoon;
 * the number of professors is not.
 */
function Attention({ data, currency }: { data: Dashboard; currency: string }) {
  const items: {
    key: string;
    icon: IconName;
    label: string;
    value: string;
    note?: string;
    href: string;
    urgent: boolean;
  }[] = [];

  if (has(data.pending_amount_minor)) {
    items.push({
      key: "pending",
      icon: "wallet",
      label: "Awaiting approval",
      value: formatMoney(data.pending_amount_minor, currency),
      note: `${formatNumber(data.pending_count)} ${
        data.pending_count === 1 ? "payment" : "payments"
      }`,
      href: "/payments?status=PENDING",
      urgent: Boolean(data.pending_count),
    });
  }

  if (has(data.payments_awaiting_review)) {
    items.push({
      key: "review",
      icon: "receipt",
      label: "Payments awaiting review",
      value: formatNumber(data.payments_awaiting_review),
      note: "Recorded, not yet approved",
      href: "/payments?status=PENDING",
      urgent: Boolean(data.payments_awaiting_review),
    });
  }

  if (has(data.assessments_unmarked)) {
    items.push({
      key: "unmarked",
      icon: "check-circle",
      label: "Assessments unmarked",
      value: formatNumber(data.assessments_unmarked),
      note: "No marks entered yet",
      href: "/grades",
      urgent: Boolean(data.assessments_unmarked),
    });
  }

  if (has(data.reviews_awaiting_moderation)) {
    items.push({
      key: "moderation",
      icon: "star",
      label: "Reviews to moderate",
      value: formatNumber(data.reviews_awaiting_moderation),
      note: "Waiting for a decision",
      href: "/reviews?status=PENDING",
      urgent: Boolean(data.reviews_awaiting_moderation),
    });
  }

  if (!items.length) return null;

  return (
    <section aria-label="Needs attention">
      <SectionHeader
        title="Needs attention"
        description="Waiting on a person, not on time."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`group flex items-center gap-3.5 rounded-xl border bg-surface p-4 shadow-xs transition-[border-color,box-shadow] hover:shadow-sm ${
              item.urgent
                ? "border-warn-line hover:border-warn"
                : "border-rule hover:border-rule-strong"
            }`}
          >
            <span
              aria-hidden
              className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${
                item.urgent
                  ? "border-warn-line bg-warn-wash text-warn"
                  : "border-rule bg-sunk text-ink-faint"
              }`}
            >
              <Icon name={item.icon} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="eyebrow block">{item.label}</span>
              <span
                className={`tabular mt-1 block text-lg font-semibold leading-tight ${
                  item.urgent ? "text-ink" : "text-ink-soft"
                }`}
              >
                {item.value}
              </span>
              {item.note ? (
                <span className="block text-xs text-ink-faint">{item.note}</span>
              ) : null}
            </span>
            <Icon
              name="chevron-right"
              size={16}
              className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * The two or three things this person actually came here to do.
 *
 * Built from permissions, so a receptionist gets "Record a payment" and a
 * professor does not - and neither is a claim about what the backend will
 * allow, only about what is worth offering.
 */
function QuickActions({
  session,
  role,
}: {
  session: Parameters<typeof can>[0];
  role: RoleCode;
}) {
  const holds = (permission: Permission) => can(session, permission);

  const actions: { href: string; label: string; icon: IconName }[] = [];

  if (holds("payment.create")) {
    actions.push({
      href: "/payments/new",
      label: "Record a payment",
      icon: "wallet",
    });
  }
  if (holds("enrollment.create")) {
    actions.push({
      href: "/enrollments/new",
      label: "Enrol a student",
      icon: "graduation",
    });
  }
  if (holds("user.create")) {
    actions.push({ href: "/users/new", label: "Add a person", icon: "user-plus" });
  }
  if (holds("payment.approve")) {
    actions.push({
      href: "/payments?status=PENDING",
      label: "Review pending payments",
      icon: "check-circle",
    });
  }
  if (holds("score.enter")) {
    actions.push({ href: "/grades", label: "Enter marks", icon: "check-circle" });
  }
  if (holds("report.view_operational")) {
    actions.push({ href: "/reports", label: "Run a report", icon: "activity" });
  }
  if (role === "STUDENT") {
    actions.push({ href: "/schedules", label: "Your timetable", icon: "calendar" });
    actions.push({ href: "/grades", label: "Your marks", icon: "check-circle" });
  }

  if (!actions.length) return null;

  return (
    <section aria-label="Quick actions">
      <SectionHeader title="Quick actions" />
      <div className="flex flex-wrap gap-2">
        {actions.slice(0, 5).map((action) => (
          <LinkButton
            key={action.href + action.label}
            href={action.href}
            icon={action.icon}
          >
            {action.label}
          </LinkButton>
        ))}
      </div>
    </section>
  );
}

/** A titled row of tiles, which disappears entirely when it holds none. */
function Group({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  const tiles = (Array.isArray(children) ? children.flat() : [children]).filter(
    Boolean,
  );
  if (!tiles.length) return null;

  return (
    <section aria-label={title}>
      <SectionHeader title={title} description={note} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tiles}</div>
    </section>
  );
}

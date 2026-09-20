import { LinkButton } from "@/components/ui/Button";
import { ErrorState, NoAccess } from "@/components/ui/EmptyState";
import { Note } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrintButton } from "@/components/ui/PrintButton";
import { Pagination } from "@/components/ui/Pagination";
import { Toolbar } from "@/components/ui/Toolbar";
import { PAYMENT_METHODS } from "@/lib/choices";
import { getJson } from "@/lib/django";
import { LOCALE_INFO } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n.server";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import {
  EXPENSE_FILTERS,
  monthName,
  periodFrom,
  periodLabel,
} from "@/lib/logistics";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { Expense, ExpenseSummary, LogisticsCategory } from "@/types";

import { SectionTabs } from "../SectionTabs";
import { ExpensesTable } from "./ExpensesTable";
import { MonthSummary } from "./MonthSummary";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.logistics.expensesTitle };
}

/**
 * One month of expenses: the totals, then the entries behind them.
 *
 * The month lives in the URL rather than in component state, so a month a
 * receptionist is looking at is a month they can send to somebody. Nothing
 * selects a month for them silently either - absent means this month, which
 * is what somebody opening "Expenses" is asking for.
 *
 * The summary is deliberately fetched for the *period* and not for the
 * filtered list. A total that changes when somebody types in the search box
 * is not a total, and this is the figure that gets copied into a report.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const cookie = await cookieHeader();
  const locale = await getLocale();
  const intl = LOCALE_INFO[locale].intl;

  const period = periodFrom(params);

  // The list is filtered by whatever is in the URL; the period is filled in
  // when it is absent, so the list and the totals above it always describe
  // the same month.
  const listParams = {
    ...params,
    year: String(period.year),
    month: String(period.month),
  };

  const [session, page, summary, categories] = await Promise.all([
    getSession(),
    fetchPage<Expense>("logistics/expenses", listParams, [...EXPENSE_FILTERS]),
    getJson<ExpenseSummary>(
      `/api/v1/logistics/expenses/summary/?year=${period.year}&month=${period.month}`,
      cookie,
    ),
    getJson<{ results: LogisticsCategory[] }>(
      "/api/v1/logistics/categories/?kind=EXPENSE&active=true&page_size=100",
      cookie,
    ),
  ]);

  if (!can(session, "expense.view")) {
    return <NoAccess what={d.logistics.expensesTitle} />;
  }
  if (!page) return <ErrorState title={d.logistics.expensesErrorTitle} />;

  const mayManage = can(session, "expense.manage");

  // A year list that reaches back far enough to be useful and no further.
  // Built from now rather than from the data: a year with nothing in it is
  // still a year somebody may want to look at and find empty.
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, index) => thisYear - index);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={d.logistics.expensesTitle}
        eyebrow={periodLabel(period, intl)}
        lede={d.logistics.expensesLede}
        actions={
          <>
            <PrintButton
              href="/print/expenses"
              params={listParams}
              filters={EXPENSE_FILTERS}
              label={d.logistics.printExpenses}
            />
            {mayManage ? (
              <LinkButton href="/logistics/expenses/new" variant="primary" icon="plus">
                {d.logistics.addExpense}
              </LinkButton>
            ) : null}
          </>
        }
      />

      <SectionTabs />

      {!mayManage ? <Note tone="neutral" icon="lock">{d.logistics.readOnly}</Note> : null}

      {summary ? <MonthSummary summary={summary} period={period} /> : null}

      <Toolbar
        filters={[
          { param: "q", label: d.filters.search, placeholder: d.logistics.name },
          {
            param: "month",
            label: d.filters.month,
            options: Array.from({ length: 12 }, (_, index) => ({
              value: String(index + 1),
              label: monthName(index + 1, intl),
            })),
          },
          {
            param: "year",
            label: d.filters.year,
            options: years.map((year) => ({
              value: String(year),
              label: String(year),
            })),
          },
          {
            param: "category",
            label: d.filters.category,
            options: (categories?.results ?? []).map((category) => ({
              value: String(category.id),
              label: category.name,
            })),
          },
          {
            param: "method",
            label: d.filters.method,
            options: PAYMENT_METHODS,
          },
          {
            param: "ordering",
            label: d.common.filter,
            options: [
              { value: "-spent_on", label: d.logistics.spentOn },
              { value: "-amount_minor", label: d.logistics.amount },
              { value: "name", label: d.logistics.name },
            ],
          },
        ]}
      />

      <ExpensesTable rows={page.results} />

      <Pagination
        count={page.count}
        page={pageFrom(params)}
        pageSize={PAGE_SIZE}
        unit={d.units.expenses}
      />
    </div>
  );
}

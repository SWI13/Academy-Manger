import { ErrorState, NoAccess } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import { LOCALE_INFO } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n.server";
import type { SearchParams } from "@/lib/list";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { ExpenseHistoryRow } from "@/types";

import { SectionTabs } from "../../SectionTabs";
import { HistoryTable } from "./HistoryTable";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.logistics.historyTitle };
}

/**
 * Previous months, and what each of them came to.
 *
 * Only months with something in them, newest first - the opposite decision to
 * the twelve-month strip on the expenses screen, and deliberately so. A
 * comparison strip needs January to exist even when it is empty; a history
 * table of thirty-six rows where twenty say zero is a table nobody scrolls.
 *
 * Every row opens the month it names. That is the whole point of the screen:
 * a total is only useful if the entries behind it are one click away.
 */
export default async function ExpenseHistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const locale = await getLocale();

  const year = Array.isArray(params.year) ? params.year[0] : params.year;
  const query = year ? `?year=${encodeURIComponent(year)}` : "";

  const [session, history] = await Promise.all([
    getSession(),
    getJson<{ results: ExpenseHistoryRow[] }>(
      `/api/v1/logistics/expenses/history/${query}`,
      await cookieHeader(),
    ),
  ]);

  if (!can(session, "expense.view")) {
    return <NoAccess what={d.logistics.historyTitle} />;
  }
  if (!history) return <ErrorState title={d.logistics.expensesErrorTitle} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={d.logistics.historyTitle} lede={d.logistics.historyLede} />

      <SectionTabs />

      <HistoryTable rows={history.results} intl={LOCALE_INFO[locale].intl} />
    </div>
  );
}

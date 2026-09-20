import { redirect } from "next/navigation";

import { getJson } from "@/lib/django";
import { LOCALE_INFO } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n.server";
import type { SearchParams } from "@/lib/list";
import { periodFrom, periodLabel } from "@/lib/logistics";
import { cookieHeader } from "@/lib/session";
import type { ExpensePrint } from "@/types";

import { printGuard } from "../../guard";
import { ExpensesSheet } from "./ExpensesSheet";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.logistics.expensesDocumentTitle };
}

export default async function PrintExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { organisation } = await printGuard("expense.view");
  const intl = LOCALE_INFO[await getLocale()].intl;

  const period = periodFrom(params);
  const sheet = await getJson<ExpensePrint>(
    `/api/v1/logistics/expenses/print/?year=${period.year}&month=${period.month}`,
    await cookieHeader(),
  );
  if (!sheet) redirect("/logistics/expenses");

  return (
    <ExpensesSheet
      organisation={organisation}
      sheet={sheet}
      subtitle={periodLabel(period, intl)}
      intl={intl}
    />
  );
}

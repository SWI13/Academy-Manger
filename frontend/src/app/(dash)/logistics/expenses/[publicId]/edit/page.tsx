import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import { LOCALE_INFO } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n.server";
import { periodLabel } from "@/lib/logistics";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { Expense, LogisticsCategory } from "@/types";

import { ExpenseForm } from "../../ExpenseForm";
import { DeleteExpense } from "./DeleteExpense";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props) {
  const d = await getDict();
  return { title: `${d.logistics.editExpense} — ${(await params).publicId}` };
}

export default async function EditExpensePage({ params }: Props) {
  const d = await getDict();
  const { publicId } = await params;
  const session = await getSession();
  const locale = await getLocale();

  if (!can(session, "expense.manage")) redirect("/logistics/expenses");

  const cookie = await cookieHeader();
  const [expense, categories] = await Promise.all([
    getJson<Expense>(`/api/v1/logistics/expenses/${publicId}/`, cookie),
    getJson<{ results: LogisticsCategory[] }>(
      "/api/v1/logistics/categories/?kind=EXPENSE&active=true&page_size=100",
      cookie,
    ),
  ]);
  if (!expense) notFound();

  // The expense's own category, even if it has since been retired - see the
  // same note on the item edit page. Retiring a label must not silently
  // re-file what is already under it.
  const options = (categories?.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }));
  if (!options.some((option) => option.id === expense.category)) {
    options.push({ id: expense.category, name: expense.category_name });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{
          href: `/logistics/expenses?year=${expense.period_year}&month=${expense.period_month}`,
          label: periodLabel(
            { year: expense.period_year, month: expense.period_month },
            LOCALE_INFO[locale].intl,
          ),
        }}
        title={d.logistics.editExpense}
        eyebrow={expense.public_id}
        actions={
          <DeleteExpense
            publicId={expense.public_id}
            name={expense.name}
            year={expense.period_year}
            month={expense.period_month}
          />
        }
      />

      <ExpenseForm expense={expense} categories={options} />
    </div>
  );
}

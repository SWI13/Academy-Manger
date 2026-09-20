import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import { getDict } from "@/lib/i18n.server";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { LogisticsCategory } from "@/types";

import { ExpenseForm } from "../ExpenseForm";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.logistics.addExpense };
}

export default async function NewExpensePage() {
  const d = await getDict();
  const session = await getSession();

  if (!can(session, "expense.manage")) redirect("/logistics/expenses");

  const categories = await getJson<{ results: LogisticsCategory[] }>(
    "/api/v1/logistics/categories/?kind=EXPENSE&active=true&page_size=100",
    await cookieHeader(),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/logistics/expenses", label: d.logistics.expensesTitle }}
        title={d.logistics.addExpense}
        lede={d.logistics.addExpenseLede}
      />

      <ExpenseForm
        categories={(categories?.results ?? []).map((row) => ({
          id: row.id,
          name: row.name,
        }))}
      />
    </div>
  );
}

import { redirect } from "next/navigation";

import { getJson } from "@/lib/django";
import { getDict } from "@/lib/i18n.server";
import type { SearchParams } from "@/lib/list";
import { ITEM_FILTERS } from "@/lib/logistics";
import { describeFilters, label, printQuery } from "@/lib/print";
import { cookieHeader } from "@/lib/session";
import type { LogisticsCategory, LogisticsLocation, LogisticsPrint } from "@/types";

import { printGuard } from "../../guard";
import { InventorySheet } from "./InventorySheet";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.logistics.documentTitle };
}

export default async function PrintLogisticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const { organisation } = await printGuard("logistics.view");

  const cookie = await cookieHeader();
  const [sheet, categories, locations] = await Promise.all([
    getJson<LogisticsPrint>(
      `/api/v1/logistics/items/print/?${printQuery(params, ITEM_FILTERS)}`,
      cookie,
    ),
    getJson<{ results: LogisticsCategory[] }>(
      "/api/v1/logistics/categories/?page_size=100",
      cookie,
    ),
    getJson<{ results: LogisticsLocation[] }>(
      "/api/v1/logistics/locations/?page_size=100",
      cookie,
    ),
  ]);
  if (!sheet) redirect("/logistics");

  return (
    <InventorySheet
      organisation={organisation}
      sheet={sheet}
      filters={describeFilters(params, [
        {
          param: "category",
          label: d.logistics.category,
          resolve: (value) =>
            categories?.results.find((row) => String(row.id) === value)?.name ?? value,
        },
        {
          param: "location",
          label: d.logistics.location,
          resolve: (value) =>
            locations?.results.find((row) => String(row.id) === value)?.name ?? value,
        },
        {
          param: "condition",
          label: d.logistics.condition,
          resolve: (value) => label(d.status, value),
        },
        {
          param: "status",
          label: d.logistics.status,
          resolve: (value) => label(d.status, value),
        },
        { param: "q", label: d.filters.search },
      ])}
    />
  );
}

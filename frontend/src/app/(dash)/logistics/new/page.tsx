import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import { getDict } from "@/lib/i18n.server";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { LogisticsCategory, LogisticsLocation } from "@/types";

import { ItemForm } from "../ItemForm";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.logistics.addItem };
}

export default async function NewLogisticsItemPage() {
  const d = await getDict();
  const session = await getSession();

  // Checked here as well as hidden from the list page. The API refuses
  // regardless, but rendering a form nobody can submit is its own kind of
  // rude.
  if (!can(session, "logistics.manage")) redirect("/logistics");

  const cookie = await cookieHeader();
  const [categories, locations] = await Promise.all([
    getJson<{ results: LogisticsCategory[] }>(
      "/api/v1/logistics/categories/?kind=ITEM&active=true&page_size=100",
      cookie,
    ),
    getJson<{ results: LogisticsLocation[] }>(
      "/api/v1/logistics/locations/?active=true&page_size=100",
      cookie,
    ),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/logistics", label: d.logistics.title }}
        title={d.logistics.addItem}
        lede={d.logistics.addItemLede}
      />

      <ItemForm
        categories={(categories?.results ?? []).map((row) => ({
          id: row.id,
          name: row.name,
        }))}
        locations={(locations?.results ?? []).map((row) => ({
          id: row.id,
          name: row.name,
        }))}
      />
    </div>
  );
}

import { redirect } from "next/navigation";

import { ErrorState } from "@/components/ui/EmptyState";
import { Note } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import { getDict } from "@/lib/i18n.server";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { LogisticsCategory, LogisticsLocation } from "@/types";

import { SectionTabs } from "../SectionTabs";
import { LabelPanel } from "./LabelPanel";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.logistics.setupTitle };
}

/**
 * Where "add a new item type without changing the code" actually happens.
 *
 * Categories and rooms are rows. This screen is the reason that decision was
 * worth making: an owner who buys the institute's first 3D printer types
 * "3D printers" here and files one, and nobody deploys anything.
 *
 * Nothing on this screen deletes. A category is referenced by every item
 * filed under it, so removing one would either orphan those rows or take them
 * with it - retiring takes it out of the dropdowns and leaves the history
 * intact, which is the same shape as deactivating an account rather than
 * deleting a person.
 */
export default async function LogisticsSetupPage() {
  const d = await getDict();
  const session = await getSession();

  if (!can(session, "logistics.manage")) redirect("/logistics");

  const cookie = await cookieHeader();
  const [itemCategories, expenseCategories, locations] = await Promise.all([
    getJson<{ results: LogisticsCategory[] }>(
      "/api/v1/logistics/categories/?kind=ITEM&page_size=100",
      cookie,
    ),
    getJson<{ results: LogisticsCategory[] }>(
      "/api/v1/logistics/categories/?kind=EXPENSE&page_size=100",
      cookie,
    ),
    getJson<{ results: LogisticsLocation[] }>(
      "/api/v1/logistics/locations/?page_size=100",
      cookie,
    ),
  ]);

  if (!itemCategories || !expenseCategories || !locations) {
    return <ErrorState title={d.logistics.errorTitle} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={d.logistics.setupTitle} lede={d.logistics.setupLede} />

      <SectionTabs />

      <Note tone="neutral" icon="info">
        {d.logistics.retiredNote}
      </Note>

      <div className="grid gap-4 lg:grid-cols-3">
        <LabelPanel
          title={d.logistics.itemCategories}
          icon="layers"
          rows={itemCategories.results}
          endpoint="/logistics/categories"
          createBody={{ kind: "ITEM" }}
          addLabel={d.logistics.addCategory}
          placeholder={d.logistics.newCategoryPlaceholder}
        />
        <LabelPanel
          title={d.logistics.expenseCategories}
          icon="receipt"
          rows={expenseCategories.results}
          endpoint="/logistics/categories"
          createBody={{ kind: "EXPENSE" }}
          addLabel={d.logistics.addCategory}
          placeholder="Security"
        />
        <LabelPanel
          title={d.logistics.rooms}
          icon="pin"
          rows={locations.results}
          endpoint="/logistics/locations"
          createBody={{}}
          addLabel={d.logistics.addRoom}
          placeholder={d.logistics.newRoomPlaceholder}
        />
      </div>
    </div>
  );
}

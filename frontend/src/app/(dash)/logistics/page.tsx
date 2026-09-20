import { LinkButton } from "@/components/ui/Button";
import { ErrorState, NoAccess } from "@/components/ui/EmptyState";
import { Note } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrintButton } from "@/components/ui/PrintButton";
import { Pagination } from "@/components/ui/Pagination";
import { Toolbar } from "@/components/ui/Toolbar";
import { getJson } from "@/lib/django";
import { getDict } from "@/lib/i18n.server";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { ITEM_FILTERS, activeFilterCount } from "@/lib/logistics";
import { can, cookieHeader, getSession } from "@/lib/session";
import type {
  LogisticsCategory,
  LogisticsItem,
  LogisticsLocation,
  LogisticsOverview,
} from "@/types";

import { LogisticsTable } from "./LogisticsTable";
import { Overview } from "./Overview";
import { SectionTabs } from "./SectionTabs";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.logistics.title };
}

/**
 * The inventory: figures on top, the list underneath.
 *
 * The dashboard and the list are one screen rather than two, because the
 * question "how many chairs" and the action "show me the chairs" are the same
 * visit - the tiles link into the filtered list below them.
 *
 * The filter dropdowns are built from the category and location rows the API
 * sends, not from a hard-coded list. That is the same decision as the
 * categories being a table in the first place: a category added this morning
 * is filterable this morning.
 */
export default async function LogisticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const cookie = await cookieHeader();

  const [session, page, overview, categories, locations] = await Promise.all([
    getSession(),
    fetchPage<LogisticsItem>("logistics/items", params, [...ITEM_FILTERS]),
    getJson<LogisticsOverview>("/api/v1/logistics/overview/", cookie),
    getJson<{ results: LogisticsCategory[] }>(
      "/api/v1/logistics/categories/?kind=ITEM&active=true&page_size=100",
      cookie,
    ),
    getJson<{ results: LogisticsLocation[] }>(
      "/api/v1/logistics/locations/?active=true&page_size=100",
      cookie,
    ),
  ]);

  // A professor or a student holds no logistics permission at all, so every
  // request above came back 403 and the page would read as broken. Said
  // plainly instead.
  if (!can(session, "logistics.view")) return <NoAccess what={d.logistics.title} />;

  if (!page) return <ErrorState title={d.logistics.errorTitle} />;

  const mayManage = can(session, "logistics.manage");
  const filtered = activeFilterCount(params, ITEM_FILTERS) > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={d.logistics.title}
        lede={d.logistics.lede}
        actions={
          <>
            {/*
              Print is not gated on `logistics.manage`. Reading the inventory
              and taking it to a store cupboard on a sheet of paper is exactly
              what the desk does with it, and it changes nothing.

              A new tab, because the sheet replaces the whole page: sending
              somebody's filtered list away and making them navigate back is a
              worse trade than one extra tab.
            */}
            <PrintButton
              href="/print/logistics"
              params={params}
              filters={ITEM_FILTERS}
              label={d.logistics.printInventory}
            />
            {mayManage ? (
              <LinkButton href="/logistics/new" variant="primary" icon="plus">
                {d.logistics.addItem}
              </LinkButton>
            ) : null}
          </>
        }
      />

      <SectionTabs />

      {!mayManage ? <Note tone="neutral" icon="lock">{d.logistics.readOnly}</Note> : null}

      {overview ? <Overview overview={overview} /> : null}

      <Toolbar
        filters={[
          { param: "q", label: d.filters.search, placeholder: d.logistics.name },
          {
            param: "category",
            label: d.filters.category,
            options: (categories?.results ?? []).map((category) => ({
              value: String(category.id),
              label: category.name,
            })),
          },
          {
            param: "condition",
            label: d.filters.condition,
            options: [
              { value: "NEW", label: d.status.NEW },
              { value: "GOOD", label: d.status.GOOD },
              { value: "NEEDS_REPAIR", label: d.status.NEEDS_REPAIR },
              { value: "DAMAGED", label: d.status.DAMAGED },
            ],
          },
          {
            param: "status",
            label: d.filters.status,
            options: [
              { value: "AVAILABLE", label: d.status.AVAILABLE },
              { value: "IN_USE", label: d.status.IN_USE },
              { value: "UNDER_REPAIR", label: d.status.UNDER_REPAIR },
              { value: "MISSING", label: d.status.MISSING },
            ],
          },
          {
            param: "location",
            label: d.filters.location,
            options: (locations?.results ?? []).map((location) => ({
              value: String(location.id),
              label: location.name,
            })),
          },
          {
            param: "ordering",
            label: d.common.filter,
            options: [
              { value: "-updated_at", label: d.logistics.lastUpdated },
              { value: "-created_at", label: d.logistics.added },
              { value: "-quantity", label: d.logistics.quantity },
              { value: "name", label: d.logistics.name },
            ],
          },
        ]}
      />

      {filtered ? (
        <Note tone="info">{d.logistics.filteredNotice}</Note>
      ) : null}

      <LogisticsTable rows={page.results} />

      <Pagination
        count={page.count}
        page={pageFrom(params)}
        pageSize={PAGE_SIZE}
        unit={d.units.items}
      />
    </div>
  );
}

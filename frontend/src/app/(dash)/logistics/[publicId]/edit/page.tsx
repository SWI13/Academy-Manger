import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import { getDict } from "@/lib/i18n.server";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { LogisticsCategory, LogisticsItem, LogisticsLocation } from "@/types";

import { ItemForm, type Option } from "../../ItemForm";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props) {
  const d = await getDict();
  return { title: `${d.logistics.editItem} — ${(await params).publicId}` };
}

export default async function EditLogisticsItemPage({ params }: Props) {
  const d = await getDict();
  const { publicId } = await params;
  const session = await getSession();

  if (!can(session, "logistics.manage")) redirect(`/logistics/${publicId}`);

  const cookie = await cookieHeader();
  const [item, categories, locations] = await Promise.all([
    getJson<LogisticsItem>(`/api/v1/logistics/items/${publicId}/`, cookie),
    getJson<{ results: LogisticsCategory[] }>(
      "/api/v1/logistics/categories/?kind=ITEM&active=true&page_size=100",
      cookie,
    ),
    getJson<{ results: LogisticsLocation[] }>(
      "/api/v1/logistics/locations/?active=true&page_size=100",
      cookie,
    ),
  ]);
  if (!item) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: `/logistics/${item.public_id}`, label: item.name }}
        title={d.logistics.editItem}
        eyebrow={item.public_id}
      />

      <ItemForm
        item={item}
        categories={withCurrent(
          (categories?.results ?? []).map(toOption),
          item.category,
          item.category_name,
        )}
        locations={withCurrent(
          (locations?.results ?? []).map(toOption),
          item.location ?? null,
          item.location_name ?? null,
        )}
      />
    </div>
  );
}

function toOption(row: { id: number; name: string }): Option {
  return { id: row.id, name: row.name };
}

/**
 * Keep the item's own category or room in the dropdown even once it is retired.
 *
 * The lists are built from active rows, which is right for a new item and
 * wrong for an existing one: without this, an item filed under a retired
 * category opens with an empty required select, and saving would quietly move
 * it somewhere else. Retiring a label must not rewrite what is already filed
 * under it.
 */
function withCurrent(
  options: Option[],
  currentId: number | null,
  currentName: string | null,
): Option[] {
  if (currentId === null || options.some((option) => option.id === currentId)) {
    return options;
  }
  return [...options, { id: currentId, name: currentName ?? String(currentId) }];
}

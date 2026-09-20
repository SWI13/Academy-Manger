import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import type { SearchParams } from "@/lib/list";
import { cookieHeader } from "@/lib/session";
import type { Notification } from "@/types";
import { getDict } from "@/lib/i18n.server";

import { NotificationList } from "./NotificationList";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.nav.notifications };
}

/**
 * Everything addressed to this person, and nothing else.
 *
 * There is no scope decision to make on this screen and no permission to
 * check beyond being signed in: a notification belongs to exactly one
 * recipient, and the queryset is filtered to the caller unconditionally.
 * There is no parameter, at any version, that widens it - so there is no
 * "everyone's notifications" view for this page to fail to hide.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const unreadOnly =
    (Array.isArray(params.unread) ? params.unread[0] : params.unread) === "true";

  const page = await getJson<{ count: number; results: Notification[] }>(
    `/api/v1/notifications/${unreadOnly ? "?unread=true" : ""}`,
    await cookieHeader(),
  );

  if (!page) {
    return <ErrorState title={d.notifications.errorTitle} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={d.nav.notifications}
        lede={d.notifications.lede}
      />

      <NotificationList
        items={page.results}
        unreadOnly={unreadOnly}
      />
    </div>
  );
}

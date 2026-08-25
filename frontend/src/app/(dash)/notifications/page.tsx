import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import type { SearchParams } from "@/lib/list";
import { cookieHeader } from "@/lib/session";
import type { Notification } from "@/types";

import { NotificationList } from "./NotificationList";

export const metadata = { title: "Notifications · SM Academy" };

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
  const params = await searchParams;
  const unreadOnly =
    (Array.isArray(params.unread) ? params.unread[0] : params.unread) === "true";

  const page = await getJson<{ count: number; results: Notification[] }>(
    `/api/v1/notifications/${unreadOnly ? "?unread=true" : ""}`,
    await cookieHeader(),
  );

  if (!page) {
    return <ErrorState title="Notifications could not be loaded" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        lede="Told to you and nobody else — an enrolment made in your name, a mark released, a payment decided."
      />

      <NotificationList
        items={page.results}
        unreadOnly={unreadOnly}
      />
    </div>
  );
}

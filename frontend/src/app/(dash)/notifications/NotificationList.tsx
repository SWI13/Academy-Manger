"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormError } from "@/components/ui/Field";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Notification } from "@/types";

/**
 * The notification centre.
 *
 * Each row is the thing it is about: a mark published is a link to the marks,
 * a payment decided is a link to the payment. `link_path` comes from the API,
 * which is why there is no mapping table here guessing where a kind of event
 * ought to lead.
 *
 * Reading one marks it read on the way through. That is what a person means
 * by opening it, and a separate "mark as read" control beside every row is a
 * control nobody wants to click twice.
 */

const MARKS: Record<string, { icon: IconName; tone: string }> = {
  COURSE_ASSIGNED: {
    icon: "book",
    tone: "border-accent-line bg-accent-soft text-accent",
  },
  SESSION_REMINDER: {
    icon: "clock",
    tone: "border-info-line bg-info-wash text-info",
  },
  ROSTER_CHANGED: {
    icon: "users",
    tone: "border-info-line bg-info-wash text-info",
  },
  SCHEDULE_CHANGED: {
    icon: "calendar",
    tone: "border-warn-line bg-warn-wash text-warn",
  },
  ENROLLED: {
    icon: "graduation",
    tone: "border-accent-line bg-accent-soft text-accent",
  },
  MARKS_PUBLISHED: {
    icon: "check-circle",
    tone: "border-ok-line bg-ok-wash text-ok",
  },
  PAYMENT_APPROVED: { icon: "check", tone: "border-ok-line bg-ok-wash text-ok" },
  PAYMENT_REJECTED: { icon: "close", tone: "border-bad-line bg-bad-wash text-bad" },
  PROOF_REVIEW_NEEDED: {
    icon: "wallet",
    tone: "border-warn-line bg-warn-wash text-warn",
  },
};

function markFor(kind: string) {
  return MARKS[kind] ?? { icon: "bell" as IconName, tone: "border-rule bg-white/[0.06] text-ink-faint" };
}

export function NotificationList({
  items,
  unreadOnly,
}: {
  items: Notification[];
  unreadOnly: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unread = items.filter((item) => !item.is_read).length;

  async function markAll() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/notifications/read-all");
      toast({ tone: "ok", title: "All marked as read" });
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof ApiFailure
          ? failure.message
          : "Could not reach the server.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function open(item: Notification) {
    if (!item.is_read) {
      // Best effort. A notification that would not mark itself read is not a
      // reason to refuse to open what it points at.
      try {
        await api.post(`/notifications/${item.id}/read`);
      } catch {
        /* ignore */
      }
    }
    if (item.link_path) router.push(item.link_path);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Two views, in the URL, so a filtered inbox can be linked to. */}
        <div className="flex gap-1 glass rounded-lg border border-rule p-1">
          <Link
            href={pathname}
            aria-current={!unreadOnly ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
              !unreadOnly
                ? "bg-white/[0.08] text-ink"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            All
          </Link>
          <Link
            href={`${pathname}?unread=true`}
            aria-current={unreadOnly ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
              unreadOnly ? "bg-white/[0.08] text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            Unread
            {unread ? (
              <span className="tabular inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-fill px-1 text-[10px] font-bold text-accent-ink">
                {unread}
              </span>
            ) : null}
          </Link>
        </div>

        {unread ? (
          <Button size="sm" icon="check" busy={busy} onClick={markAll}>
            Mark all as read
          </Button>
        ) : null}
      </div>

      {error ? <FormError>{error}</FormError> : null}

      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const mark = markFor(item.kind);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className={`flex w-full items-start gap-3.5 rounded-xl border p-4 text-left shadow-xs transition-[border-color,background-color,box-shadow] hover:shadow-sm ${
                    item.is_read
                      ? "glass border-rule hover:border-rule-strong"
                      : "border-accent-line bg-accent-soft/40 hover:border-accent"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${mark.tone}`}
                  >
                    <Icon name={mark.icon} size={17} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span
                        className={`text-sm ${
                          item.is_read
                            ? "font-medium text-ink-soft"
                            : "font-semibold text-ink"
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="tabular text-xs text-ink-faint">
                        {formatDateTime(item.created_at)}
                      </span>
                    </span>

                    <span className="mt-1 block text-[13px] leading-relaxed text-ink-soft">
                      {item.message}
                    </span>

                    <span className="mt-2 flex items-center gap-2">
                      <span className="eyebrow">{item.kind_display}</span>
                      {item.link_path ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                          Open
                          <Icon name="arrow-right" size={12} />
                        </span>
                      ) : null}
                    </span>
                  </span>

                  {!item.is_read ? (
                    <span
                      aria-label="Unread"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon="bell"
          tone={unreadOnly ? "ok" : "neutral"}
          title={unreadOnly ? "Nothing unread" : "No notifications yet"}
          description={
            unreadOnly
              ? "You are all caught up."
              : "You will hear about the things that concern you — an enrolment, a mark released, a payment decided."
          }
        />
      )}
    </div>
  );
}

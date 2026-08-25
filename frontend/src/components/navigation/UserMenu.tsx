"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import {
  Dropdown,
  MenuItem,
  MenuSeparator,
} from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api";
import { ROLE_LABELS, type RoleCode } from "@/lib/permissions";

type Props = {
  fullName: string;
  publicId: string;
  role: RoleCode;
};

export function UserMenu({ fullName, publicId, role }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await api.post("/auth/logout/");
    } finally {
      // Even if the call failed, send them to the login screen. The session
      // may already be gone - that is one of the ways this can fail - and
      // leaving someone on a dashboard they can no longer load is worse than
      // an extra sign-in.
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <Dropdown
      label="Account"
      trigger={({ open, onClick, id, ref }) => (
        <button
          ref={ref}
          id={id}
          type="button"
          onClick={onClick}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center gap-2 rounded-lg p-1 pr-1.5 transition-colors hover:bg-sunk"
        >
          <Avatar name={fullName} seed={publicId} size="sm" />
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block max-w-36 truncate text-[13px] font-medium leading-tight text-ink">
              {fullName}
            </span>
            <span className="block text-[11px] leading-tight text-ink-faint">
              {ROLE_LABELS[role]}
            </span>
          </span>
          <Icon
            name="chevron-down"
            size={14}
            className={`text-ink-faint transition-transform duration-[110ms] ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      )}
    >
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <Avatar name={fullName} seed={publicId} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{fullName}</p>
          <p className="tabular truncate text-xs text-ink-faint">
            {publicId} · {ROLE_LABELS[role]}
          </p>
        </div>
      </div>

      <MenuSeparator />

      <Link
        href="/account"
        role="menuitem"
        data-menu-item
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink-soft transition-colors hover:bg-sunk hover:text-ink"
      >
        <Icon name="user" size={16} />
        Your account
      </Link>
      <Link
        href="/notifications"
        role="menuitem"
        data-menu-item
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink-soft transition-colors hover:bg-sunk hover:text-ink"
      >
        <Icon name="bell" size={16} />
        Notifications
      </Link>

      <MenuSeparator />

      <MenuItem icon="logout" tone="danger" onClick={signOut} disabled={busy}>
        {busy ? "Signing out…" : "Sign out"}
      </MenuItem>
    </Dropdown>
  );
}

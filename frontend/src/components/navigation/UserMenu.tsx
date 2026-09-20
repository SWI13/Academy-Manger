"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDict } from "@/components/LocaleProvider";
import { Avatar } from "@/components/ui/Avatar";
import {
  Dropdown,
  MenuItem,
  MenuSeparator,
} from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api";
import type { RoleCode } from "@/lib/permissions";

type Props = {
  fullName: string;
  publicId: string;
  role: RoleCode;
};

export function UserMenu({ fullName, publicId, role }: Props) {
  const d = useDict();
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
      label={d.shell.accountMenu}
      trigger={({ open, onClick, id, ref }) => (
        <button
          ref={ref}
          id={id}
          type="button"
          onClick={onClick}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center gap-2 rounded-lg p-1 pe-1.5 transition-colors hover:bg-white/[0.06]"
        >
          <Avatar name={fullName} seed={publicId} size="sm" />
          <span className="hidden min-w-0 text-start sm:block">
            <span className="block max-w-36 truncate text-[13px] font-medium leading-tight text-ink">
              {fullName}
            </span>
            <span className="block text-[11px] leading-tight text-ink-faint">
              {d.roles[role]}
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
            {publicId} · {d.roles[role]}
          </p>
        </div>
      </div>

      <MenuSeparator />

      <Link
        href="/account"
        role="menuitem"
        data-menu-item
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm text-ink-soft transition-colors hover:bg-white/[0.06] hover:text-ink"
      >
        <Icon name="user" size={16} />
        {d.shell.yourAccount}
      </Link>
      <Link
        href="/notifications"
        role="menuitem"
        data-menu-item
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm text-ink-soft transition-colors hover:bg-white/[0.06] hover:text-ink"
      >
        <Icon name="bell" size={16} />
        {d.shell.notifications}
      </Link>

      <MenuSeparator />

      <MenuItem icon="logout" tone="danger" onClick={signOut} disabled={busy}>
        {busy ? d.shell.signingOut : d.shell.signOut}
      </MenuItem>
    </Dropdown>
  );
}

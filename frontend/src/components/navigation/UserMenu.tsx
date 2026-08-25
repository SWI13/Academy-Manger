"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
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
    <div className="flex items-center gap-4">
      <div className="text-right">
        <p className="text-sm font-medium text-ink">{fullName}</p>
        <p className="tabular text-xs text-ink-faint">
          {publicId} · {ROLE_LABELS[role]}
        </p>
      </div>
      <Button variant="quiet" onClick={signOut} busy={busy}>
        Sign out
      </Button>
    </div>
  );
}

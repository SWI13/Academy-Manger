import { ErrorState, NoAccess } from "@/components/ui/EmptyState";
import { Note } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import { getDict } from "@/lib/i18n.server";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { Organisation } from "@/types";

import { OrganisationForm } from "./OrganisationForm";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.settings.title };
}

/**
 * The institute's own details.
 *
 * Readable by anybody signed in - it is the header of every document they can
 * already print - and editable only by `settings.manage`, which is the owner
 * alone in the seed matrix. Both halves come from the API, including
 * `can_manage`, so this screen does not have to work the answer out from a
 * permission list of its own.
 */
export default async function SettingsPage() {
  const d = await getDict();

  const [session, organisation] = await Promise.all([
    getSession(),
    getJson<Organisation>("/api/v1/organisation/", await cookieHeader()),
  ]);

  // Everybody signed in may read it, so there is no permission gate here -
  // but the screen is only offered in the rail to whoever may change it, and
  // somebody who arrives by URL should be told which of those they are.
  if (!session) return <NoAccess what={d.settings.title} />;
  if (!organisation) return <ErrorState title={d.settings.errorTitle} />;

  const mayManage = can(session, "settings.manage");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={d.settings.title} lede={d.settings.lede} />

      {!mayManage ? <Note tone="neutral" icon="lock">{d.settings.readOnly}</Note> : null}

      <OrganisationForm organisation={organisation} mayManage={mayManage} />
    </div>
  );
}

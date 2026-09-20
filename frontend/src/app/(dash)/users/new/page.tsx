import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { can, getSession } from "@/lib/session";
import { getDict } from "@/lib/i18n.server";

import { NewPersonForm } from "./NewPersonForm";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.users.newPerson };
}

export default async function NewPersonPage() {
  const d = await getDict();
  const session = await getSession();
  // Checked on the server as well as hidden from the nav. The API refuses
  // regardless, but rendering a form nobody can submit is its own kind of
  // rude.
  if (!can(session, "user.create")) redirect("/users");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/users", label: d.nav.users }}
        title={d.users.newPerson}
        lede={d.users.newPersonLede}
      />

      <NewPersonForm />
    </div>
  );
}

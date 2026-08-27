import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { can, getSession } from "@/lib/session";

import { NewPersonForm } from "./NewPersonForm";

export const metadata = { title: "New person" };

export default async function NewPersonPage() {
  const session = await getSession();
  // Checked on the server as well as hidden from the nav. The API refuses
  // regardless, but rendering a form nobody can submit is its own kind of
  // rude.
  if (!can(session, "user.create")) redirect("/users");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/users", label: "People" }}
        title="New person"
        lede="There is no public registration — every account is created here by staff, and the roles you can hand out are bounded by your own."
      />

      <NewPersonForm />
    </div>
  );
}

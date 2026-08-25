import Link from "next/link";
import { redirect } from "next/navigation";

import { can, getSession } from "@/lib/session";

import { NewPersonForm } from "./NewPersonForm";

export const metadata = { title: "New person · SM Academy" };

export default async function NewPersonPage() {
  const session = await getSession();
  // Checked on the server as well as hidden from the nav. The API refuses
  // regardless, but rendering a form nobody can submit is its own kind of
  // rude.
  if (!can(session, "user.create")) redirect("/users");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/users" className="text-sm text-ink-soft hover:text-ink">
          ← People
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">
          New person
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          There is no public registration — every account is created here by
          staff.
        </p>
      </header>

      <NewPersonForm />
    </div>
  );
}

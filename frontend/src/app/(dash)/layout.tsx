import Link from "next/link";
import { redirect } from "next/navigation";

import { SessionProvider } from "@/components/SessionProvider";
import { Sidebar } from "@/components/navigation/Sidebar";
import { UserMenu } from "@/components/navigation/UserMenu";
import { getSession } from "@/lib/session";

/**
 * The signed-in shell.
 *
 * The session is fetched here, on the server, on every render. That means a
 * deactivated account or a revoked role takes effect on the next page load -
 * no cached permission set to go stale, and nothing about who you are living
 * in the browser where it could be edited.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <SessionProvider session={session}>
      <div className="flex min-h-svh flex-col bg-paper">
        <header className="flex items-center justify-between gap-4 border-b border-rule bg-surface px-4 py-3">
          <Link href="/dashboard" className="text-lg font-semibold text-ink">
            SM Academy
          </Link>
          <UserMenu
            fullName={session.full_name}
            publicId={session.public_id}
            role={session.primary_role}
          />
        </header>

        <div className="flex flex-1 flex-col md:flex-row">
          <aside className="border-b border-rule bg-surface md:w-56 md:shrink-0 md:border-r md:border-b-0">
            <Sidebar permissions={session.permissions} />
          </aside>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}

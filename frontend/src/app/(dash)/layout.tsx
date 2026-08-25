import { redirect } from "next/navigation";

import { SessionProvider } from "@/components/SessionProvider";
import { Sidebar } from "@/components/navigation/Sidebar";
import { TopBar } from "@/components/navigation/TopBar";
import { getJson } from "@/lib/django";
import { cookieHeader, getSession } from "@/lib/session";

/**
 * The signed-in shell.
 *
 * The session is fetched here, on the server, on every render. That means a
 * deactivated account or a revoked role takes effect on the next page load -
 * no cached permission set to go stale, and nothing about who you are living
 * in the browser where it could be edited.
 *
 * The unread count comes with it, from the same render. A badge that polls is
 * a request every thirty seconds from every open tab to tell almost all of
 * them that nothing has changed; this one is right as of the page you are
 * looking at, which is when you would act on it anyway.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const unread = await getJson<{ unread: number }>(
    "/api/v1/notifications/unread-count/",
    await cookieHeader(),
  );

  return (
    <SessionProvider session={session}>
      <div className="flex min-h-svh bg-paper">
        <Sidebar
          permissions={session.permissions}
          role={session.primary_role}
          fullName={session.full_name}
          publicId={session.public_id}
          unread={unread?.unread ?? 0}
        />

        {/*
          min-w-0 is load-bearing. Without it a wide table inside a flex child
          refuses to shrink and pushes the whole workspace sideways, which is
          how a roster on a laptop ends up scrolling the page rather than the
          table.
        */}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            fullName={session.full_name}
            publicId={session.public_id}
            role={session.primary_role}
            permissions={session.permissions}
            unread={unread?.unread ?? 0}
          />

          <main className="page-enter mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}

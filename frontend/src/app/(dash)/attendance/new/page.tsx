import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import { getDict } from "@/lib/i18n.server";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { Course } from "@/types";

import { OpenRegisterForm } from "./OpenRegisterForm";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.attendance.openRegister };
}

export default async function NewRegisterPage() {
  const d = await getDict();
  const session = await getSession();

  if (!can(session, "attendance.record")) redirect("/attendance");

  // Only courses this caller can reach - which for a professor is the ones
  // they teach. The picker therefore cannot offer a class the API would
  // refuse to open a register for.
  const courses = await getJson<{ results: Course[] }>(
    "/api/v1/courses/?status=ACTIVE&page_size=100",
    await cookieHeader(),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/attendance", label: d.attendance.title }}
        title={d.attendance.openRegister}
        lede={d.attendance.openRegisterLede}
      />

      <OpenRegisterForm courses={courses?.results ?? []} />
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";

import { getJson } from "@/lib/django";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { Course, Enrollment, User } from "@/types";

import { EnrolForm } from "./EnrolForm";

export const metadata = { title: "Enrol a student · SM Academy" };

export default async function NewEnrolmentPage() {
  const session = await getSession();
  // Checked here as well as hidden from the list page. The API refuses
  // regardless, but rendering a form nobody can submit is its own kind of rude.
  if (!can(session, "enrollment.create")) redirect("/enrollments");

  const cookie = await cookieHeader();

  const [students, courses, existing] = await Promise.all([
    getJson<{ results: User[] }>(
      "/api/v1/users/?role=STUDENT&status=ACTIVE&page_size=100",
      cookie,
    ),
    getJson<{ results: Course[] }>("/api/v1/courses/?page_size=100", cookie),
    // Used only to warn before submitting. The unique constraint is the real
    // guard; this just means the desk finds out before pressing the button.
    getJson<{ results: Enrollment[] }>(
      "/api/v1/enrollments/?page_size=100",
      cookie,
    ),
  ]);

  // A course accepts enrolments while it is a draft or active. Filtered here
  // so the dropdown cannot offer one the serializer will refuse.
  const open = (courses?.results ?? []).filter(
    (course) => course.status === "DRAFT" || course.status === "ACTIVE",
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/enrollments" className="text-sm text-ink-soft hover:text-ink">
          ← Enrolments
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">
          Enrol a student
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          One student, one course. Everything else — payments, marks, a review —
          hangs off the enrolment this creates.
        </p>
      </header>

      <EnrolForm
        students={students?.results ?? []}
        courses={open}
        existing={existing?.results ?? []}
      />
    </div>
  );
}

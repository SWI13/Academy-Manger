import { redirect } from "next/navigation";

/**
 * There is no public landing page. Everything here is somebody's record.
 * `/dashboard` bounces to `/login` when there is no session.
 */
export default function Home() {
  redirect("/dashboard");
}

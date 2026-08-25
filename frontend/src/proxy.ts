import { NextResponse, type NextRequest } from "next/server";

/**
 * A fast bounce for people with no session cookie at all.
 *
 * Next 16 calls this file `proxy`, not `middleware`.
 *
 * This is **not** authentication. It only checks that a cookie named
 * `sessionid` exists; it does not know whether it is valid, whether the
 * account is still active, or what that account may do. Anyone can set a
 * cookie.
 *
 * The real checks are two: the shell layout asks Django who the caller is on
 * every render, and Django refuses every request that arrives without a live
 * session. This exists so a signed-out visitor gets the login page
 * immediately instead of a shell that renders and then redirects.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("sessionid")) return NextResponse.next();

  const login = new URL("/login", request.url);
  const target = request.nextUrl.pathname + request.nextUrl.search;
  if (target !== "/") login.searchParams.set("next", target);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login page, the BFF (which must reach Django to
  // sign in at all), and static assets.
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};

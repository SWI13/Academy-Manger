import { NextRequest } from "next/server";

import { callDjango } from "@/lib/django";

/**
 * The BFF: every browser request to the API goes through here.
 *
 * It forwards the caller's cookies to Django, echoes Django's Set-Cookie
 * headers back, and returns the status and body unchanged. It does not
 * interpret a 403, does not retry, and does not decide anything - Django owns
 * every authorization answer, and a proxy that second-guesses one is a proxy
 * that can get it wrong.
 *
 * Its value is what it hides. The browser never learns Django's address, and
 * the session cookie is scoped to this origin only.
 */

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
]);

async function proxy(request: NextRequest, path: string[]) {
  const suffix = path.length ? `${path.join("/")}/` : "";
  const search = request.nextUrl.search;
  const target = `/api/v1/${suffix}${search}`;

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? null
      : await request.text();

  const upstream = await callDjango(target, {
    method: request.method,
    body,
    cookie: request.headers.get("cookie"),
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
    },
  });

  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.append(key, value);
  });

  // A 204 or 304 must not carry a body, and constructing one with an empty
  // string is a runtime error rather than a no-op.
  const passthroughBody =
    upstream.status === 204 || upstream.status === 304
      ? null
      : await upstream.text();

  return new Response(passthroughBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  return proxy(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: Context) {
  return proxy(request, (await context.params).path);
}

export async function PUT(request: NextRequest, context: Context) {
  return proxy(request, (await context.params).path);
}

export async function PATCH(request: NextRequest, context: Context) {
  return proxy(request, (await context.params).path);
}

export async function DELETE(request: NextRequest, context: Context) {
  return proxy(request, (await context.params).path);
}

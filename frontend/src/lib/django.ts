import "server-only";

/**
 * The only module that knows Django's address.
 *
 * Django is not routed publicly. The browser talks to Next, Next talks to
 * Django over the internal network, and the session cookie the browser holds
 * is issued by Django but only ever travels between the browser and this
 * server. That is the whole reason the session is a cookie rather than a
 * token: an HttpOnly cookie cannot be read by any script that gets onto the
 * page, and a deactivated account stops working on its very next request
 * rather than whenever a token happens to expire.
 *
 * Nothing outside `src/app/api` and server components should import this.
 * `server-only` makes an accidental client import a build error rather than a
 * leaked internal hostname.
 */

export const DJANGO_URL = (
  process.env.DJANGO_INTERNAL_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/** Pull one cookie out of a raw Cookie header. */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export type DjangoRequestInit = {
  method?: string;
  body?: BodyInit | null;
  /** The browser's raw Cookie header, forwarded verbatim. */
  cookie?: string | null;
  headers?: Record<string, string>;
  cache?: RequestCache;
};

/**
 * One call to Django, carrying the caller's session.
 *
 * Two headers are set rather than forwarded. `X-CSRFToken` is echoed from the
 * csrftoken cookie, because Django's session authentication requires it on
 * every unsafe method and the browser is not the one making this request.
 * `Origin` is set to our own site so Django's CSRF referer check passes over
 * HTTPS, where it is not skipped.
 *
 * Everything else about the response is returned untouched, status included.
 * This layer decides nothing: an authorization answer belongs to Django, and
 * a proxy that reinterprets a 403 is a proxy that can get it wrong.
 */
export async function callDjango(
  path: string,
  init: DjangoRequestInit = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...init.headers,
  };

  if (init.cookie) {
    headers.Cookie = init.cookie;
  }

  // Tell Django which host the browser actually used. Without it every
  // absolute URL Django builds - DRF's pagination `next` most visibly - comes
  // back as http://backend:8000/..., which leaks the internal hostname into
  // the browser and is a link it could not follow anyway.
  const site = new URL(SITE_URL);
  headers["X-Forwarded-Host"] = site.host;
  headers["X-Forwarded-Proto"] = site.protocol.replace(":", "");

  if (!SAFE_METHODS.has(method)) {
    const csrf = readCookie(init.cookie ?? null, "csrftoken");
    if (csrf) headers["X-CSRFToken"] = csrf;
    headers.Origin = SITE_URL;
    headers.Referer = SITE_URL + "/";
  }

  return fetch(`${DJANGO_URL}${path}`, {
    method,
    headers,
    body: init.body,
    // Never cached. Every response here is scoped to one caller, and a shared
    // cache keyed on a URL would serve one student's data to another.
    cache: init.cache ?? "no-store",
    redirect: "manual",
  });
}

/** Fetch JSON from Django, for server components. Returns null on any non-2xx. */
export async function getJson<T>(
  path: string,
  cookie: string | null,
): Promise<T | null> {
  const response = await callDjango(path, { cookie });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

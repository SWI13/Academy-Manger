/**
 * The client-side API caller.
 *
 * Everything goes to our own origin under /api/v1/, which the BFF forwards.
 * The browser never holds a token and never sees Django's address; the
 * session cookie rides along because it belongs to this origin.
 */

export type ApiError = {
  code: string;
  message: string;
  details: Record<string, unknown>;
};

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = "ApiFailure";
    this.status = status;
    this.code = error.code;
    this.details = error.details ?? {};
  }

  /** Field-level messages, for putting errors next to the input that caused them. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [field, value] of Object.entries(this.details)) {
      out[field] = Array.isArray(value) ? String(value[0]) : String(value);
    }
    return out;
  }
}

const FALLBACK: Record<number, string> = {
  401: "Your session has ended. Sign in again.",
  403: "Your role does not include this.",
  404: "Not found.",
  409: "That cannot be done in the current state.",
  500: "Something went wrong on our side.",
};

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  // Django wants a trailing slash; Next redirects one away. The BFF adds it
  // back on the way out, so paths are written without it here and callers do
  // not have to remember which side of that argument they are on. A 308 on a
  // POST is a silent no-op, which is a miserable thing to debug.
  const clean = path.replace(/\/+$/, "");

  const response = await fetch(`/api/v1${clean}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    credentials: "same-origin",
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error: ApiError = payload?.error ?? {
      code: "unexpected",
      message: FALLBACK[response.status] ?? "Request failed.",
      details: payload ?? {},
    };
    throw new ApiFailure(response.status, error);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

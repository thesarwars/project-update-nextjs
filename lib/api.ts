import { getCurrentUser } from "./auth";
import { DatabaseBusyError } from "./db";
import type { User } from "./types";

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export function unauthorized(message = "Sign in to continue."): Response {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = "You do not have access to that."): Response {
  return Response.json({ error: message }, { status: 403 });
}

export function notFound(message = "Not found"): Response {
  return Response.json({ error: message }, { status: 404 });
}

export function conflict(message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error: message, ...extra }, { status: 409 });
}

/** 422 for a request that parsed but breaks a domain rule, e.g. an illegal parent type. */
export function unprocessable(message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error: message, ...extra }, { status: 422 });
}

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function trimmedString(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length === 0 || t.length > max ? null : t;
}

/* ------------------------------------------------------------------ *
 * Guards
 * ------------------------------------------------------------------ */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Same-origin check for mutating requests.
 *
 * This is the second of three CSRF layers, after SameSite=Lax and before requiring a
 * JSON content type. Together they cover the cases a token would, without threading a
 * header through every fetch in the client — which is also why the existing autosave
 * keeps working untouched.
 */
export function checkOrigin(request: Request): Response | null {
  if (SAFE_METHODS.has(request.method)) return null;

  const host = request.headers.get("host");
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!host || !source) return forbidden("Missing origin.");

  try {
    if (new URL(source).host !== host) return forbidden("Cross-origin request refused.");
  } catch {
    return forbidden("Malformed origin.");
  }
  return null;
}

/**
 * The signed-in user, or a `Response` to return immediately.
 *
 * Shaped to read like the validation already in these handlers:
 *
 *     const auth = await requireApiUser(request);
 *     if (auth instanceof Response) return auth;
 */
export async function requireApiUser(request: Request): Promise<User | Response> {
  const origin = checkOrigin(request);
  if (origin) return origin;

  const user = await getCurrentUser();
  if (!user) return unauthorized();
  return user;
}

/**
 * Turns a lost write lock into 503 + Retry-After rather than a 500. The client's
 * debounced save re-queues on failure, so a busy write is invisible to whoever is typing.
 */
export function handleDbError(err: unknown): Response {
  if (err instanceof DatabaseBusyError) {
    return Response.json(
      { error: "The database is busy. Try again." },
      { status: 503, headers: { "Retry-After": "1" } },
    );
  }
  throw err;
}

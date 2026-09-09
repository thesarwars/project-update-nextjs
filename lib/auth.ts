import "server-only";

import { randomBytes, hash as cryptoHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSession,
  deleteSession,
  findSession,
  findUserForSignIn,
  recordLogin,
  refreshSession,
} from "./db";
import { DUMMY_HASH, verifyPassword } from "./password";
import type { User } from "./types";

/* ------------------------------------------------------------------ *
 * Sessions
 * ------------------------------------------------------------------ */

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;
/** Slide the expiry once it is closer than this, so an active user never signs in again. */
const SLIDE_WHEN_DAYS_LEFT = 15;

const days = (n: number) => n * 24 * 60 * 60 * 1000;

/** The cookie holds the token; the database stores only its SHA-256. */
const tokenToId = (token: string) => cryptoHash("sha256", token, "hex");

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // Lax, not Strict: this app is built around shareable URLs, and Strict withholds the
    // cookie on cross-site top-level navigation, so every link pasted into a chat would
    // land on the login page.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Issue a session and set its cookie. Only valid in a Route Handler or Server Function. */
export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + days(SESSION_DAYS)).toISOString();
  const agent = (await headers()).get("user-agent");

  createSession({ id: tokenToId(token), userId, expiresAt, userAgent: agent });
  recordLogin(userId);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 24 * 60 * 60));
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(tokenToId(token));
  store.delete(SESSION_COOKIE);
}

/**
 * The signed-in user, or null. Safe to call anywhere — it never writes a cookie, so it
 * works in Server Components as well as handlers.
 */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const found = findSession(tokenToId(token));
  if (!found) return null;
  if (found.user.status === "disabled") return null;

  const msLeft = new Date(found.session.expiresAt).getTime() - Date.now();
  const staleSeen = Date.now() - new Date(found.session.lastSeenAt).getTime() > 5 * 60 * 1000;

  if (msLeft < days(SLIDE_WHEN_DAYS_LEFT)) {
    // Slide the database expiry. The cookie is re-set by handlers that can write one;
    // an active user hits those constantly through autosave.
    refreshSession(found.session.id, new Date(Date.now() + days(SESSION_DAYS)).toISOString());
  } else if (staleSeen) {
    refreshSession(found.session.id, null); // throttled: a write per request is wrong here
  }

  return found.user;
}

/** For pages. Sends anyone signed out to the login screen. */
export async function requireUser(nextPath?: string): Promise<User> {
  const user = await getCurrentUser();
  if (user) return user;
  redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
}

/* ------------------------------------------------------------------ *
 * Sign in
 * ------------------------------------------------------------------ */

export type SignInResult =
  | { ok: true; user: User }
  | { ok: false; reason: "invalid" | "disabled" | "rate-limited" };

/** In-process and per-process, which is right for a single-process deployment. */
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function rateLimited(key: string): boolean {
  const record = attempts.get(key);
  if (!record) return false;
  if (Date.now() - record.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const record = attempts.get(key);
  if (!record || Date.now() - record.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  record.count += 1;
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const key = email.trim().toLowerCase();
  if (rateLimited(key)) return { ok: false, reason: "rate-limited" };

  const found = findUserForSignIn(key);

  // Hash even when the address is unknown, so a miss and a wrong password take the
  // same time and neither reveals whether the account exists.
  const matches = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH);

  if (!found || !found.passwordHash || !matches) {
    recordFailure(key);
    return { ok: false, reason: "invalid" };
  }
  if (found.user.status === "disabled") return { ok: false, reason: "disabled" };

  attempts.delete(key);
  await startSession(found.user.id);
  return { ok: true, user: found.user };
}

"use server";

import { redirect } from "next/navigation";
import { clearThrottle, getCurrentUser, signIn, startSession, throttle } from "@/lib/auth";
import { checkPasswordStrength, hashPassword } from "@/lib/password";
import { hash as sha } from "node:crypto";
import {
  acceptInvite,
  claimInviteAs,
  countUsers,
  createFirstAdmin,
  findUserByEmail,
  markEmailVerified,
  resetUserPassword,
  signUpUser,
} from "@/lib/db";
import { checkCode, normalizeCode, sendCode } from "@/lib/otp";

export interface FormState {
  error: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MINUTE = 60 * 1000;
/** Mail is the expensive, abusable side. Guessing is bounded in the database instead. */
const SEND_LIMIT = { max: 3, windowMs: 10 * MINUTE };

/** Keeps a redirect target from being turned into an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/* ------------------------------------------------------------------ *
 * Sign in
 * ------------------------------------------------------------------ */

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const result = await signIn(email, password);
  if (!result.ok) {
    if (result.reason === "rate-limited") {
      return { error: "Too many attempts. Wait a few minutes and try again." };
    }
    if (result.reason === "disabled") return { error: "That account has been disabled." };
    if (result.reason === "unverified") {
      // Right password, unfinished account: send a fresh code and put them on the code
      // screen rather than making them guess what is wrong.
      const user = findUserByEmail(email);
      if (user && !throttle(`send:${user.id}`, SEND_LIMIT.max, SEND_LIMIT.windowMs)) {
        await sendCode(user, "verify");
      }
      redirect(`/verify?email=${encodeURIComponent(email)}`);
    }
    // Deliberately the same message whether the address is unknown or the password is
    // wrong — anything more specific tells a stranger who works here.
    return { error: "That email and password do not match." };
  }

  redirect(safeNext(formData.get("next")));
}

/* ------------------------------------------------------------------ *
 * First run
 * ------------------------------------------------------------------ */

export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = field(formData, "name");
  const email = field(formData, "email");
  const password = String(formData.get("password") ?? "");

  if (!name) return { error: "Enter your name." };
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  const weak = checkPasswordStrength(password);
  if (weak) return { error: weak };
  if (countUsers() > 0) return { error: "This app has already been set up. Sign in instead." };

  const created = createFirstAdmin({ name, email, passwordHash: await hashPassword(password) });
  if (created === "already-setup") {
    return { error: "This app has already been set up. Sign in instead." };
  }

  await startSession(created.id);
  redirect("/");
}

/* ------------------------------------------------------------------ *
 * Sign up
 * ------------------------------------------------------------------ */

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = field(formData, "name");
  const email = field(formData, "email");
  const password = String(formData.get("password") ?? "");

  if (!name) return { error: "Enter your name." };
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  const weak = checkPasswordStrength(password);
  if (weak) return { error: weak };
  if (countUsers() === 0) redirect("/setup");

  const key = email.toLowerCase();
  if (throttle(`signup:${key}`, 5, 15 * MINUTE)) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  const result = signUpUser({ name, email, passwordHash: await hashPassword(password) });

  // Both branches end on the same screen saying the same thing. Anything else turns the
  // signup form into a way to ask whether a given address already has an account here.
  if (result.ok && !throttle(`send:${result.user.id}`, SEND_LIMIT.max, SEND_LIMIT.windowMs)) {
    await sendCode(result.user, "verify");
  }
  redirect(`/verify?email=${encodeURIComponent(email)}`);
}

/* ------------------------------------------------------------------ *
 * Verify an address
 * ------------------------------------------------------------------ */

export async function verifyEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  const code = normalizeCode(String(formData.get("code") ?? ""));
  if (!code) return { error: "Enter the six-digit code from your email." };

  const user = findUserByEmail(email);
  if (!user) return { error: "That code is not right. Check the email and try again." };
  if (user.emailVerifiedAt) redirect(`/login?email=${encodeURIComponent(email)}`);

  const outcome = checkCode(user.id, "verify", code);
  if (outcome === "too-many-attempts") {
    return { error: "Too many wrong codes. Ask for a new one." };
  }
  if (outcome === "expired") return { error: "That code has expired. Ask for a new one." };
  if (outcome === "wrong") return { error: "That code is not right. Check the email and try again." };

  markEmailVerified(user.id);
  clearThrottle(`signup:${email.toLowerCase()}`);
  await startSession(user.id);
  redirect("/");
}

/** A plain form action: it always redirects, so there is no state to thread back. */
export async function resendCodeAction(formData: FormData): Promise<void> {
  const email = field(formData, "email");
  const purpose = field(formData, "purpose") === "reset" ? "reset" : "verify";

  const user = findUserByEmail(email);
  if (user && !throttle(`send:${user.id}`, SEND_LIMIT.max, SEND_LIMIT.windowMs)) {
    const wanted = purpose === "verify" ? !user.emailVerifiedAt : true;
    if (wanted) await sendCode(user, purpose);
  }

  // Same answer whether or not anything was sent, for the same reason as signup.
  redirect(`/${purpose === "reset" ? "reset" : "verify"}?email=${encodeURIComponent(email)}&sent=1`);
}

/* ------------------------------------------------------------------ *
 * Forgotten password
 * ------------------------------------------------------------------ */

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = field(formData, "email");
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };

  const user = findUserByEmail(email);
  // An account with no password was invited and never claimed; a reset code is exactly
  // the right way for them to finish, so it is not excluded here.
  if (user && user.status !== "disabled") {
    if (!throttle(`send:${user.id}`, SEND_LIMIT.max, SEND_LIMIT.windowMs)) {
      await sendCode(user, "reset");
    }
  }

  redirect(`/reset?email=${encodeURIComponent(email)}`);
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = field(formData, "email");
  const code = normalizeCode(String(formData.get("code") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!code) return { error: "Enter the six-digit code from your email." };
  const weak = checkPasswordStrength(password);
  if (weak) return { error: weak };

  const user = findUserByEmail(email);
  if (!user) return { error: "That code is not right. Check the email and try again." };

  const outcome = checkCode(user.id, "reset", code);
  if (outcome === "too-many-attempts") {
    return { error: "Too many wrong codes. Ask for a new one." };
  }
  if (outcome === "expired") return { error: "That code has expired. Ask for a new one." };
  if (outcome === "wrong") return { error: "That code is not right. Check the email and try again." };

  // Signs out every existing session, including the one that may not be theirs.
  resetUserPassword(user.id, await hashPassword(password));
  clearThrottle(email.toLowerCase());
  await startSession(user.id);
  redirect("/");
}

/* ------------------------------------------------------------------ *
 * Invitations
 * ------------------------------------------------------------------ */

export async function acceptInviteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const name = field(formData, "name");
  const password = String(formData.get("password") ?? "");

  if (!token) return { error: "That invitation link is not valid." };
  if (!name) return { error: "Enter your name." };
  const weak = checkPasswordStrength(password);
  if (weak) return { error: weak };

  const result = acceptInvite({
    tokenHash: sha("sha256", token, "hex"),
    name,
    passwordHash: await hashPassword(password),
  });

  if (!result.ok) {
    if (result.reason === "seat-taken") {
      return { error: "Someone has already claimed that place. Ask for a new invitation." };
    }
    if (result.reason === "sign-in-required") {
      return { error: "That email already has an account. Sign in first, then open this link again." };
    }
    return { error: "That invitation has expired or already been used." };
  }

  await startSession(result.userId);
  redirect("/");
}

/**
 * Accept an invitation while already signed in.
 *
 * Holding the link is not proof of owning an existing account, so this path leans on the
 * session instead and never touches the password.
 */
export async function claimInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "That invitation link is not valid." };

  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first, then open this link again." };

  const result = claimInviteAs(sha("sha256", token, "hex"), user.id);
  if (!result.ok) {
    if (result.reason === "seat-taken") return { error: "Someone has already claimed that place." };
    if (result.reason === "sign-in-required") {
      return { error: "That invitation is for a different email address." };
    }
    return { error: "That invitation has expired or already been used." };
  }

  redirect("/");
}

"use server";

import { redirect } from "next/navigation";
import { signIn, startSession } from "@/lib/auth";
import { checkPasswordStrength, hashPassword } from "@/lib/password";
import { countUsers, createFirstAdmin } from "@/lib/db";

export interface FormState {
  error: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Keeps a redirect target from being turned into an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const result = await signIn(email, password);
  if (!result.ok) {
    if (result.reason === "rate-limited") {
      return { error: "Too many attempts. Wait a few minutes and try again." };
    }
    if (result.reason === "disabled") return { error: "That account has been disabled." };
    // Deliberately the same message whether the address is unknown or the password is
    // wrong — anything more specific tells a stranger who works here.
    return { error: "That email and password do not match." };
  }

  redirect(safeNext(formData.get("next")));
}

export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
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

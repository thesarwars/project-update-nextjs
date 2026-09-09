import { redirect } from "next/navigation";
import AuthForm from "../AuthForm";
import { loginAction } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { countUsers } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in · Standup" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Nobody exists yet, so there is nothing to sign in to.
  if (countUsers() === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/");

  const { next } = await searchParams;
  return (
    <AuthForm
      action={loginAction}
      title="Sign in"
      submitLabel="Sign in"
      autoComplete="current-password"
      next={typeof next === "string" ? next : undefined}
    />
  );
}

import Link from "next/link";
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
    <>
      <AuthForm
        action={loginAction}
        title="Sign in"
        submitLabel="Sign in"
        autoComplete="current-password"
        next={typeof next === "string" ? next : undefined}
        footer={
          <p className="text-center text-[12.5px]">
            <Link href="/forgot" className="font-medium text-accent hover:underline">
              Forgot your password?
            </Link>
          </p>
        }
      />
      <p className="mt-4 text-center text-[12.5px] text-muted">
        No account yet?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create one
        </Link>
      </p>
    </>
  );
}

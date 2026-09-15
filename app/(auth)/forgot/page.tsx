import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForm from "../AuthForm";
import { forgotPasswordAction } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { countUsers } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reset your password · Standup" };

export default async function ForgotPage() {
  if (countUsers() === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/");

  return (
    <>
      <AuthForm
        action={forgotPasswordAction}
        title="Reset your password"
        intro="Enter your email and we will send a six-digit code."
        submitLabel="Send the code"
        autoComplete="current-password"
        hidePassword
      />
      <p className="mt-4 text-center text-[12.5px] text-muted">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForm from "../AuthForm";
import { signUpAction } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { Field, inputClass } from "@/components/ui";
import { countUsers } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Create an account · Standup" };

export default async function SignUpPage() {
  if (countUsers() === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/");

  return (
    <>
      <AuthForm
        action={signUpAction}
        title="Create an account"
        intro="We will email you a six-digit code to confirm the address."
        submitLabel="Create account"
        autoComplete="new-password"
        passwordHint="At least 10 characters."
        focusEmail={false}
        extraFields={
          <Field label="Your name">
            <input
              name="name"
              type="text"
              autoComplete="name"
              required
              autoFocus
              className={inputClass}
            />
          </Field>
        }
      />
      <p className="mt-4 text-center text-[12.5px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

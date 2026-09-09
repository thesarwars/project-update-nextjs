import { redirect } from "next/navigation";
import CodeForm from "../CodeForm";
import { verifyEmailAction } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { mailIsConfigured } from "@/lib/mail";

export const dynamic = "force-dynamic";

export const metadata = { title: "Confirm your email · Standup" };

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  if (await getCurrentUser()) redirect("/");

  const { email, sent } = await searchParams;
  // Nothing to confirm without an address, and guessing one here would be a way to
  // discover them.
  if (typeof email !== "string" || !email) redirect("/signup");

  return (
    <CodeForm
      action={verifyEmailAction}
      purpose="verify"
      email={email}
      title="Confirm your email"
      intro={`If ${email} is not already in use, a six-digit code is on its way to it.`}
      submitLabel="Confirm and sign in"
      justSent={sent === "1"}
      showMailWarning={!mailIsConfigured()}
    />
  );
}

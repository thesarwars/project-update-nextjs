import { redirect } from "next/navigation";
import CodeForm from "../CodeForm";
import { resetPasswordAction } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { mailIsConfigured } from "@/lib/mail";

export const dynamic = "force-dynamic";

export const metadata = { title: "Choose a new password · Standup" };

export default async function ResetPage({ searchParams }: PageProps<"/reset">) {
  if (await getCurrentUser()) redirect("/");

  const { email, sent } = await searchParams;
  if (typeof email !== "string" || !email) redirect("/forgot");

  return (
    <CodeForm
      action={resetPasswordAction}
      purpose="reset"
      email={email}
      title="Choose a new password"
      intro={`If ${email} has an account, a six-digit code is on its way to it. Using the code signs out every other device.`}
      submitLabel="Set the password and sign in"
      withPassword
      justSent={sent === "1"}
      showMailWarning={!mailIsConfigured()}
    />
  );
}

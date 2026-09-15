import { redirect } from "next/navigation";
import AuthForm from "../AuthForm";
import { setupAction } from "@/lib/actions/auth";
import { Field, inputClass } from "@/components/ui";
import { countUsers } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Set up · Standup" };

export default async function SetupPage() {
  // Setup exists only while there are no accounts. The action re-checks inside its own
  // transaction, so two people opening this page at once cannot both become admin.
  if (countUsers() > 0) redirect("/login");

  return (
    <AuthForm
      action={setupAction}
      title="Create the first account"
      intro="This account is the administrator. Everyone else signs up or joins by invitation."
      submitLabel="Create account and sign in"
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
  );
}

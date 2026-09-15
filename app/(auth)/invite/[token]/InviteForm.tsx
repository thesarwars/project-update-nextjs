"use client";

import { useActionState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { acceptInviteAction } from "@/lib/actions/auth";

interface Props {
  token: string;
  email: string;
  personName: string | null;
  projectName: string | null;
}

export default function InviteForm({ token, email, personName, projectName }: Props) {
  const [state, formAction, pending] = useActionState(acceptInviteAction, { error: null });

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 card-shadow"
    >
      <div>
        <h1 className="text-[15px] font-semibold">
          {personName && projectName
            ? `Join ${projectName} as ${personName}`
            : "Join the standup"}
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          Pick a password and everything {personName ?? "you"} has already written in the
          standup becomes yours.
        </p>
      </div>

      <input type="hidden" name="token" value={token} />

      <Field label="Email">
        <input value={email} readOnly disabled className={`${inputClass} text-muted`} />
      </Field>

      <Field label="Your name">
        <input
          name="name"
          type="text"
          defaultValue={personName ?? ""}
          autoComplete="name"
          required
          autoFocus
          className={inputClass}
        />
      </Field>

      <Field label="Password" hint="At least 10 characters.">
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>

      {state.error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? "Please wait…" : "Join and sign in"}
      </Button>
    </form>
  );
}

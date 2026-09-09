"use client";

import { useActionState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/actions/auth";

interface Props {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  title: string;
  intro?: string;
  submitLabel: string;
  /** Rendered before the password field — the setup form needs a name. */
  extraFields?: React.ReactNode;
  next?: string;
  passwordHint?: string;
  autoComplete: "current-password" | "new-password";
  /** False when an earlier field should take focus instead. */
  focusEmail?: boolean;
  /** The forgotten-password form asks for the address alone. */
  hidePassword?: boolean;
  /** Rendered under the submit button — sign-up and forgot-password links. */
  footer?: React.ReactNode;
}

export default function AuthForm({
  action,
  title,
  intro,
  submitLabel,
  extraFields,
  next,
  passwordHint,
  autoComplete,
  focusEmail = true,
  hidePassword = false,
  footer,
}: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 card-shadow"
    >
      <div>
        <h1 className="text-[15px] font-semibold">{title}</h1>
        {intro ? <p className="mt-1 text-[13px] text-muted">{intro}</p> : null}
      </div>

      {next ? <input type="hidden" name="next" value={next} /> : null}
      {extraFields}

      <Field label="Email">
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus={focusEmail}
          className={inputClass}
        />
      </Field>

      {hidePassword ? null : (
        <Field label="Password" hint={passwordHint}>
          <input
            name="password"
            type="password"
            autoComplete={autoComplete}
            required
            className={inputClass}
          />
        </Field>
      )}

      {state.error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? "Please wait…" : submitLabel}
      </Button>

      {footer}
    </form>
  );
}

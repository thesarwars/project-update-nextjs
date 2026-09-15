"use client";

import { useActionState } from "react";
import Link from "next/link";
import OtpInput from "@/components/OtpInput";
import { Button, Field, inputClass } from "@/components/ui";
import { resendCodeAction, type FormState } from "@/lib/actions/auth";

interface Props {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  purpose: "verify" | "reset";
  email: string;
  title: string;
  intro: string;
  submitLabel: string;
  /** The reset flow sets a new password in the same step as proving the code. */
  withPassword?: boolean;
  justSent?: boolean;
  /** True when SMTP is unconfigured, so the code is only in the server console. */
  showMailWarning?: boolean;
}

export default function CodeForm({
  action,
  purpose,
  email,
  title,
  intro,
  submitLabel,
  withPassword = false,
  justSent = false,
  showMailWarning = false,
}: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <div className="flex flex-col gap-3">
      <form
        action={formAction}
        className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 card-shadow"
      >
        <div>
          <h1 className="text-[15px] font-semibold">{title}</h1>
          <p className="mt-1 text-[13px] text-muted">{intro}</p>
        </div>

        <input type="hidden" name="email" value={email} />

        <Field label="Six-digit code">
          <OtpInput />
        </Field>

        {withPassword ? (
          <Field label="New password" hint="At least 10 characters.">
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              className={inputClass}
            />
          </Field>
        ) : null}

        {justSent ? (
          <p className="rounded-lg bg-success/10 px-3 py-2 text-[12.5px] text-success">
            A new code is on its way. The previous one no longer works.
          </p>
        ) : null}

        {showMailWarning ? (
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[12.5px] text-muted">
            Email is not configured on this server, so the code was written to the server
            console and to <span className="font-medium">data/outbox/mail.log</span> instead.
          </p>
        ) : null}

        {state.error ? (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? "Please wait…" : submitLabel}
        </Button>
      </form>

      {/* A sibling, never nested: a form inside a form is invalid and the inner one is dropped. */}
      <form action={resendCodeAction} className="text-center">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="purpose" value={purpose} />
        <span className="text-[12.5px] text-muted">Did not get it? </span>
        <button
          type="submit"
          className="text-[12.5px] font-medium text-accent hover:underline"
        >
          Send another code
        </button>
      </form>

      <p className="text-center text-[12.5px] text-muted">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

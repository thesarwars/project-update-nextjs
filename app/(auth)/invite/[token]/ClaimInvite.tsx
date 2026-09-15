"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { claimInviteAction } from "@/lib/actions/auth";

interface Props {
  token: string;
  userName: string;
  personName: string | null;
  projectName: string | null;
}

/**
 * Already signed in as the invited address.
 *
 * The session is the proof of ownership here, so this path never asks for a password and
 * never sets one — which is exactly what stops a forwarded link from becoming a way into
 * somebody else's account.
 */
export default function ClaimInvite({ token, userName, personName, projectName }: Props) {
  const [state, formAction, pending] = useActionState(claimInviteAction, { error: null });

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 card-shadow"
    >
      <div>
        <h1 className="text-[15px] font-semibold">
          {personName && projectName
            ? `Take ${personName}'s place on ${projectName}`
            : "Accept this invitation"}
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          You are signed in as {userName}. Accepting links this account to{" "}
          {personName ?? "that place"}, and everything already written under it becomes yours.
          Your password does not change.
        </p>
      </div>

      <input type="hidden" name="token" value={token} />

      {state.error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? "Please wait…" : "Accept invitation"}
      </Button>
    </form>
  );
}

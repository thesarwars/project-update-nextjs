import { hash as sha } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import InviteForm from "./InviteForm";
import ClaimInvite from "./ClaimInvite";
import { getCurrentUser } from "@/lib/auth";
import { findLiveInvite } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Join · Standup" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const found = findLiveInvite(sha("sha256", token, "hex"));

  // An expired or already-used link is indistinguishable from a wrong one, on purpose:
  // a stranger poking at /invite/<guess> learns nothing either way.
  if (!found) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5 card-shadow">
        <h1 className="text-[15px] font-semibold">This invitation is no longer valid</h1>
        <p className="mt-1 text-[13px] text-muted">
          It may have expired, or already been used. Ask for a fresh link.
        </p>
      </div>
    );
  }

  if (found.invite.acceptedAt) redirect("/login");

  const user = await getCurrentUser();
  const sameAddress = user?.email.toLowerCase() === found.invite.email.toLowerCase();

  // Three cases, and the middle one is the security-relevant one.
  //
  // Signed in as the invited address: the session proves it, so just accept. The address
  // already has an account but this is not their session: they must sign in first, since
  // holding a link that was pasted into a group chat is not proof of owning the account
  // it names. Otherwise it is a genuinely new account, and they choose a password.
  if (user && sameAddress) {
    return (
      <ClaimInvite
        token={token}
        userName={user.name}
        personName={found.personName}
        projectName={found.projectName}
      />
    );
  }

  if (found.emailHasAccount) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5 card-shadow">
        <h1 className="text-[15px] font-semibold">Sign in to accept this</h1>
        <p className="mt-1 text-[13px] text-muted">
          {found.invite.email} already has an account. Sign in as that address and open this
          link again — your existing password is not changed. Forgotten it?{" "}
          <Link href="/forgot" className="font-medium text-accent hover:underline">
            Reset it here
          </Link>
          .
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
          className="mt-4 inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[13px] font-medium text-accent-contrast transition hover:brightness-110"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <InviteForm
      token={token}
      email={found.invite.email}
      personName={found.personName}
      projectName={found.projectName}
    />
  );
}

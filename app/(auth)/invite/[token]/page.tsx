import { hash as sha } from "node:crypto";
import { redirect } from "next/navigation";
import InviteForm from "./InviteForm";
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

  return (
    <InviteForm
      token={token}
      email={found.invite.email}
      personName={found.personName}
      projectName={found.projectName}
    />
  );
}

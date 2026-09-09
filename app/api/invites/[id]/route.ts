import type { NextRequest } from "next/server";
import { json, requireApiAdmin } from "@/lib/api";
import { revokeInvite } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/invites/[id]">) {
  const auth = await requireApiAdmin(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  revokeInvite(id);
  return json({ ok: true });
}

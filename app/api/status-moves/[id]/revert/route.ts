import type { NextRequest } from "next/server";
import { forbidden, json, notFound, requireApiUser } from "@/lib/api";
import { getStatusMove, revertStatusMove } from "@/lib/db";
import { canAccessProject } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Put a recorded status move back. What the Undo in a toast calls.
 *
 * The same server code a backwards drag runs, so undoing by button and undoing by
 * dragging the parent back cannot disagree — and like that path, it leaves alone
 * anything somebody has moved on since.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/status-moves/[id]/revert">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const move = getStatusMove(id);
  if (!move) return notFound("No such move.");
  if (!canAccessProject(auth, move.projectId)) return forbidden("You are not on that project.");

  const result = revertStatusMove(id);
  if (typeof result === "string") return notFound("No such move.");
  return json(result);
}

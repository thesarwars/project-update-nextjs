import type { NextRequest } from "next/server";
import { badRequest, conflict, forbidden, json, notFound, readJsonBody, requireApiUser } from "@/lib/api";
import { closeSprint, getSprint, startSprint } from "@/lib/db";
import { canManageProject } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/sprints/[id]/state">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  if (!canManageProject(auth)) return forbidden("Only an administrator can start or close a sprint.");

  const { id } = await ctx.params;
  if (!getSprint(id)) return notFound("No such sprint.");

  const body = await readJsonBody<{ action?: unknown; carryToSprintId?: unknown }>(request);
  const action = body?.action;

  if (action === "start") {
    const result = startSprint(id);
    if (result === "already-active") {
      return conflict("Another sprint is already running. Complete it first.");
    }
    if (typeof result === "string") return badRequest("That sprint cannot be started.");
    return json({ sprint: result });
  }

  if (action === "close") {
    const result = closeSprint(id, {
      closedBy: auth.id,
      carryToSprintId:
        typeof body?.carryToSprintId === "string" ? body.carryToSprintId : null,
    });
    if (typeof result === "string") return badRequest("That sprint cannot be closed.");
    return json({ sprint: result });
  }

  return badRequest("action must be start or close.");
}

import type { NextRequest } from "next/server";
import { badRequest, forbidden, json, notFound, readJsonBody, requireApiUser, unprocessable } from "@/lib/api";
import { addToSprint, getSprint, removeFromSprint, sprintCounts, sprintScopeIds } from "@/lib/db";
import { canAccessProject } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Add one or many issues. Task-level work moves rather than being double-booked. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/sprints/[id]/scope">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const sprint = getSprint(id);
  if (!sprint) return notFound("No such sprint.");
  if (!canAccessProject(auth, sprint.projectId)) return forbidden("You are not on that project.");

  const body = await readJsonBody<{ issueIds?: unknown }>(request);
  const ids = Array.isArray(body?.issueIds)
    ? body.issueIds.filter((x): x is string => typeof x === "string")
    : [];
  if (!ids.length) return badRequest("issueIds is required.");

  let moved = 0;
  for (const issueId of ids) {
    const result = addToSprint(id, issueId, auth.id);
    if (result === "not-open") return unprocessable("That sprint is closed.", { code: "closed" });
    if (result === "moved") moved += 1;
  }

  return json({ scope: sprintScopeIds(id), counts: sprintCounts(id), moved });
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/sprints/[id]/scope">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const sprint = getSprint(id);
  if (!sprint) return notFound("No such sprint.");
  if (!canAccessProject(auth, sprint.projectId)) return forbidden("You are not on that project.");

  const issueId = request.nextUrl.searchParams.get("issueId");
  if (!issueId) return badRequest("issueId is required.");

  removeFromSprint(id, issueId);
  return json({ scope: sprintScopeIds(id), counts: sprintCounts(id) });
}

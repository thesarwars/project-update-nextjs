import type { NextRequest } from "next/server";
import { badRequest, conflict, forbidden, json, notFound, readJsonBody, requireApiUser } from "@/lib/api";
import { archiveIssue, getIssue, updateIssue } from "@/lib/db";
import { isValidISODate } from "@/lib/date";
import { MAX_ESTIMATE_HOURS } from "@/lib/schedule";
import { canAccessProject } from "@/lib/permissions";
import { refusal } from "../route";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/issues/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const existing = getIssue(id);
  if (!existing) return notFound("No such issue.");
  if (!canAccessProject(auth, existing.projectId)) return forbidden("You are not on that project.");

  const body = await readJsonBody<Record<string, unknown>>(request);
  if (!body) return badRequest("Expected a JSON body.");

  const patch: Parameters<typeof updateIssue>[1] = {};
  if (typeof body.title === "string") patch.title = body.title.slice(0, 500);
  if (typeof body.description === "string") patch.description = body.description.slice(0, 20000);
  if (typeof body.statusId === "string") patch.statusId = body.statusId;
  if (body.assigneePersonId !== undefined) {
    patch.assigneePersonId =
      typeof body.assigneePersonId === "string" && body.assigneePersonId
        ? body.assigneePersonId
        : null;
  }
  if (typeof body.priority === "number") patch.priority = body.priority;

  // Hours. Anything that is not a usable positive number — null, NaN, a negative, a
  // typo with too many digits — clears the estimate rather than storing a value the
  // scheduler would have to defend itself against later.
  if (body.estimate !== undefined) {
    const hours = typeof body.estimate === "number" ? body.estimate : NaN;
    patch.estimate =
      Number.isFinite(hours) && hours > 0 ? Math.min(hours, MAX_ESTIMATE_HOURS) : null;
  }

  for (const field of ["startDate", "dueDate"] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null || value === "") patch[field] = null;
    else if (isValidISODate(value)) patch[field] = value;
    else return badRequest(`${field} must be a date like 2026-09-15.`);
  }

  const result = updateIssue(
    id,
    patch,
    typeof body.version === "number" ? body.version : undefined,
  );

  if (result === "conflict") {
    // Hand back the current row so the client can show what changed underneath it.
    return conflict("Someone else changed this issue while you were editing.", {
      issue: getIssue(id),
    });
  }
  if (typeof result === "string") return refusal(result, existing.type);
  return json({ issue: result });
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/issues/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const existing = getIssue(id);
  if (!existing) return notFound("No such issue.");
  if (!canAccessProject(auth, existing.projectId)) return forbidden("You are not on that project.");

  // Archive rather than delete: the parent key cascades, so a real delete would take the
  // whole subtree with it.
  const result = archiveIssue(id, request.nextUrl.searchParams.get("restore") !== "1");
  if (typeof result === "string") return refusal(result, existing.type);
  return json({ issue: result });
}

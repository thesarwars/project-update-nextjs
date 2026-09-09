import type { NextRequest } from "next/server";
import { badRequest, forbidden, json, notFound, readJsonBody, requireApiUser } from "@/lib/api";
import { getIssue, moveIssue, moveIssueOnBoard } from "@/lib/db";
import { canAccessProject } from "@/lib/permissions";
import { refusal } from "../../route";

export const dynamic = "force-dynamic";

interface Body {
  parentId?: unknown;
  beforeId?: unknown;
  afterId?: unknown;
  /** Set by the board, where a drop changes column and position together. */
  statusId?: unknown;
}

/**
 * Re-parent and/or reorder. Deliberately has no version check: this is the drag path,
 * where last write wins is what a user expects and a conflict dialog mid-drag would be absurd.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/issues/[id]/move">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const existing = getIssue(id);
  if (!existing) return notFound("No such issue.");
  if (!canAccessProject(auth, existing.projectId)) return forbidden("You are not on that project.");

  const body = await readJsonBody<Body>(request);
  if (!body) return badRequest("Expected a JSON body.");

  const asId = (value: unknown) =>
    typeof value === "string" && value ? value : value === null ? null : undefined;

  const statusId = typeof body.statusId === "string" ? body.statusId : undefined;

  const result = statusId
    ? moveIssueOnBoard(id, {
        statusId,
        beforeId: asId(body.beforeId),
        afterId: asId(body.afterId),
      })
    : moveIssue(id, {
        parentId: "parentId" in body ? asId(body.parentId) : undefined,
        beforeId: asId(body.beforeId) ?? undefined,
        afterId: asId(body.afterId) ?? undefined,
      });

  if (typeof result === "string") return refusal(result, existing.type);
  return json({ issue: result });
}

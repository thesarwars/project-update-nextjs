import type { NextRequest } from "next/server";
import { badRequest, forbidden, json, notFound, readJsonBody, requireApiUser, trimmedString } from "@/lib/api";
import { deleteSprint, getSprint, updateSprint } from "@/lib/db";
import { canManageProject } from "@/lib/permissions";
import { DURATION_UNITS, isValidISODate, type DurationUnit } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/sprints/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  if (!canManageProject(auth)) return forbidden("Only an administrator can plan sprints.");

  const { id } = await ctx.params;
  if (!getSprint(id)) return notFound("No such sprint.");

  const body = await readJsonBody<Record<string, unknown>>(request);
  if (!body) return badRequest("Expected a JSON body.");

  const sprint = updateSprint(id, {
    name: trimmedString(body.name, 120) ?? undefined,
    goal: typeof body.goal === "string" ? body.goal.slice(0, 500) : undefined,
    durationUnit: DURATION_UNITS.includes(body.durationUnit as DurationUnit)
      ? (body.durationUnit as DurationUnit)
      : undefined,
    durationCount:
      typeof body.durationCount === "number" ? Math.max(1, body.durationCount) : undefined,
    startDate:
      body.startDate === null
        ? null
        : isValidISODate(body.startDate)
          ? body.startDate
          : undefined,
  });
  return sprint ? json({ sprint }) : notFound("No such sprint.");
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/sprints/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  if (!canManageProject(auth)) return forbidden("Only an administrator can plan sprints.");

  const { id } = await ctx.params;
  return deleteSprint(id) ? json({ ok: true }) : notFound("No such sprint.");
}

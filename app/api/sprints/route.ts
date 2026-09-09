import type { NextRequest } from "next/server";
import { badRequest, forbidden, json, notFound, readJsonBody, requireApiUser, trimmedString } from "@/lib/api";
import { createSprint, listSprints, projectExists } from "@/lib/db";
import { canAccessProject, canManageProject } from "@/lib/permissions";
import { DURATION_UNITS, isValidISODate, type DurationUnit } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) return badRequest("projectId is required.");
  if (!projectExists(projectId)) return notFound("No such project.");
  if (!canAccessProject(auth, projectId)) return forbidden("You are not on that project.");

  return json({ sprints: listSprints(projectId) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonBody<Record<string, unknown>>(request);
  if (!body) return badRequest("Expected a JSON body.");

  const projectId = trimmedString(body.projectId, 60);
  const name = trimmedString(body.name, 120);
  if (!projectId) return badRequest("projectId is required.");
  if (!name) return badRequest("A sprint name is required.");
  if (!projectExists(projectId)) return notFound("No such project.");
  if (!canManageProject(auth)) return forbidden("Only an administrator can plan sprints.");

  const unit = DURATION_UNITS.includes(body.durationUnit as DurationUnit)
    ? (body.durationUnit as DurationUnit)
    : "weeks";
  const count = typeof body.durationCount === "number" ? Math.max(1, body.durationCount) : 2;
  const startDate = isValidISODate(body.startDate) ? body.startDate : null;

  return json(
    {
      sprint: createSprint({
        projectId,
        name,
        goal: typeof body.goal === "string" ? body.goal.slice(0, 500) : "",
        durationUnit: unit,
        durationCount: count,
        startDate,
      }),
    },
    { status: 201 },
  );
}

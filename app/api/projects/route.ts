import type { NextRequest } from "next/server";
import { badRequest, json, readJsonBody, requireApiUser, trimmedString } from "@/lib/api";
import { createProject, getSetting, listProjects } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  return json({ projects: listProjects(), lastProjectId: getSetting("lastProjectId") });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonBody<{ name?: unknown; people?: unknown }>(request);
  const name = trimmedString(body?.name, 80);
  if (!name) return badRequest("A project name is required.");

  const peopleNames = Array.isArray(body?.people)
    ? body.people.map((n) => trimmedString(n, 80)).filter((n): n is string => Boolean(n))
    : [];

  return json({ project: createProject(name, peopleNames) }, { status: 201 });
}

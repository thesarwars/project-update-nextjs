import type { NextRequest } from "next/server";
import { badRequest, json, notFound, readJsonBody, requireApiUser } from "@/lib/api";
import { isValidISODate } from "@/lib/date";
import {
  datesWithContent,
  entriesForDate,
  personBelongsToProject,
  previousDateWithContent,
  projectExists,
  setEntry,
} from "@/lib/db";
import { SECTION_KEYS, type EntryText } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const params = request.nextUrl.searchParams;
  const projectId = params.get("projectId");
  const date = params.get("date");
  if (!projectId) return badRequest("projectId is required.");
  if (!isValidISODate(date)) return badRequest("date must be YYYY-MM-DD.");
  if (!projectExists(projectId)) return notFound("No such project.");

  return json({
    date,
    entries: entriesForDate(projectId, date),
    previousDate: previousDateWithContent(projectId, date),
    dates: datesWithContent(projectId),
  });
}

const MAX_FIELD = 20000;

export async function PUT(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonBody<Record<string, unknown>>(request);
  if (!body) return badRequest("Expected a JSON body.");
  const { projectId, date, personId } = body;
  if (typeof projectId !== "string") return badRequest("projectId is required.");
  if (!isValidISODate(date)) return badRequest("date must be YYYY-MM-DD.");
  if (typeof personId !== "string") return badRequest("personId is required.");

  const patch: Partial<EntryText> = {};
  for (const key of SECTION_KEYS) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "string") return badRequest(`${key} must be a string.`);
    patch[key] = value.slice(0, MAX_FIELD);
  }

  if (!projectExists(projectId)) return notFound("No such project.");
  if (!personBelongsToProject(projectId, personId))
    return notFound("No such person in this project.");

  return json({ entry: setEntry(projectId, date, personId, patch) });
}

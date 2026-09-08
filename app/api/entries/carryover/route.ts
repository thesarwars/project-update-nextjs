import type { NextRequest } from "next/server";
import { badRequest, json, notFound } from "@/lib/api";
import { isValidISODate } from "@/lib/date";
import { entriesForDate, previousDateWithContent, projectExists } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The most recent earlier day that has content, so the composer can pull a
 * person's previous ToDo forward into today.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const projectId = params.get("projectId");
  const date = params.get("date");
  if (!projectId) return badRequest("projectId is required.");
  if (!isValidISODate(date)) return badRequest("date must be YYYY-MM-DD.");
  if (!projectExists(projectId)) return notFound("No such project.");

  const from = previousDateWithContent(projectId, date);
  return json({ from, entries: from ? entriesForDate(projectId, from) : {} });
}

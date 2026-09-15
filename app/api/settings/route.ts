import type { NextRequest } from "next/server";
import { badRequest, json, readJsonBody, requireApiUser } from "@/lib/api";
import { projectExists, setSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonBody<{ lastProjectId?: unknown }>(request);
  if (!body || typeof body.lastProjectId !== "string")
    return badRequest("lastProjectId is required.");

  if (projectExists(body.lastProjectId)) setSetting("lastProjectId", body.lastProjectId);
  return json({ ok: true });
}

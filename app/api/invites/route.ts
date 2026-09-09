import { randomBytes, hash as sha } from "node:crypto";
import type { NextRequest } from "next/server";
import { badRequest, json, notFound, readJsonBody, requireApiAdmin, trimmedString } from "@/lib/api";
import { createInvite, getProject, listInvitesForProject } from "@/lib/db";
import { ROLES, type Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_DAYS = 7;

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(request);
  if (auth instanceof Response) return auth;

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) return badRequest("projectId is required.");
  return json({ invites: listInvitesForProject(projectId) });
}

interface Body {
  projectId?: unknown;
  personId?: unknown;
  email?: unknown;
  role?: unknown;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonBody<Body>(request);
  if (!body) return badRequest("Expected a JSON body.");

  const projectId = trimmedString(body.projectId, 60);
  const personId = trimmedString(body.personId, 60);
  const email = trimmedString(body.email, 200);
  if (!projectId || !personId) return badRequest("projectId and personId are required.");
  if (!email || !EMAIL.test(email)) return badRequest("Enter a valid email address.");

  const role: Role = ROLES.includes(body.role as Role) ? (body.role as Role) : "member";

  const project = getProject(projectId);
  const person = project?.people.find((p) => p.id === personId);
  if (!project || !person) return notFound("No such person in this project.");

  // The raw token is returned exactly once, here. Only its hash is stored, so a leaked
  // database cannot be turned back into working invite links.
  const token = randomBytes(32).toString("base64url");
  const invite = createInvite({
    tokenHash: sha("sha256", token, "hex"),
    email,
    name: person.name,
    role,
    personId,
    createdBy: auth.id,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });

  return json(
    { invite, url: new URL(`/invite/${token}`, request.nextUrl.origin).toString() },
    { status: 201 },
  );
}

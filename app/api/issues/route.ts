import type { NextRequest } from "next/server";
import { badRequest, forbidden, json, notFound, readJsonBody, requireApiUser, trimmedString, unprocessable } from "@/lib/api";
import { createIssue, listIssues, listStatuses, projectExists } from "@/lib/db";
import { canAccessProject } from "@/lib/permissions";
import { ISSUE_TYPES, PARENT_RULES, type IssueType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const params = request.nextUrl.searchParams;
  const projectId = params.get("projectId");
  if (!projectId) return badRequest("projectId is required.");
  if (!projectExists(projectId)) return notFound("No such project.");
  if (!canAccessProject(auth, projectId)) return forbidden("You are not on that project.");

  return json({
    issues: listIssues(projectId, {
      includeArchived: params.get("archived") === "1",
      under: params.get("under") ?? undefined,
    }),
    statuses: listStatuses(projectId),
  });
}

/** Maps a domain refusal onto a status a client can act on. */
function refusal(error: string, type?: IssueType): Response {
  switch (error) {
    case "no-project":
    case "no-parent":
    case "not-found":
      return notFound("That issue or project does not exist.");
    case "illegal-parent":
      return unprocessable(`A ${type} cannot sit there.`, {
        code: "illegal_parent_type",
        childType: type,
        allowedParents: type ? PARENT_RULES[type] : [],
      });
    case "illegal-root":
      return unprocessable(`A ${type} must have a parent.`, {
        code: "illegal_root_type",
        childType: type,
        allowedParents: type ? PARENT_RULES[type] : [],
      });
    case "cycle":
      return unprocessable("An issue cannot be moved inside itself.", { code: "cycle" });
    case "too-deep":
      return unprocessable("That would nest the issues too deeply.", { code: "too_deep" });
    default:
      return badRequest(error);
  }
}

export { refusal };

interface Body {
  projectId?: unknown;
  type?: unknown;
  title?: unknown;
  parentId?: unknown;
  description?: unknown;
  assigneePersonId?: unknown;
  priority?: unknown;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonBody<Body>(request);
  if (!body) return badRequest("Expected a JSON body.");

  const projectId = trimmedString(body.projectId, 60);
  const title = trimmedString(body.title, 500);
  const type = body.type as IssueType;
  if (!projectId) return badRequest("projectId is required.");
  if (!title) return badRequest("A title is required.");
  if (!ISSUE_TYPES.includes(type)) return badRequest("Unknown issue type.");
  if (!projectExists(projectId)) return notFound("No such project.");
  if (!canAccessProject(auth, projectId)) return forbidden("You are not on that project.");

  const created = createIssue({
    projectId,
    type,
    title,
    description: typeof body.description === "string" ? body.description : "",
    parentId: typeof body.parentId === "string" && body.parentId ? body.parentId : null,
    assigneePersonId:
      typeof body.assigneePersonId === "string" && body.assigneePersonId
        ? body.assigneePersonId
        : null,
    reporterUserId: auth.id,
    priority: typeof body.priority === "number" ? body.priority : 3,
  });

  if (typeof created === "string") return refusal(created, type);
  return json({ issue: created }, { status: 201 });
}

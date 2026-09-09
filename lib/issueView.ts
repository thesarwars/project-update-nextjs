import "server-only";

import { getIssue, getIssueByKey, listIssues, listStatuses } from "./db";
import type { Issue, Person, Project, Status } from "./types";
import { getProject } from "./db";

export interface IssueView {
  issue: Issue;
  project: Project;
  status: Status | undefined;
  statuses: Status[];
  statusById: Record<string, Status>;
  people: Person[];
  ancestors: Issue[];
  children: Issue[];
}

/** Everything the detail surface needs, from a display key like `GS-142`. */
export function loadIssueView(key: string): IssueView | null {
  const issue = getIssueByKey(key);
  if (!issue) return null;

  const project = getProject(issue.projectId);
  if (!project) return null;

  const statuses = listStatuses(issue.projectId);
  const statusById: Record<string, Status> = {};
  for (const status of statuses) statusById[status.id] = status;

  // `path` is `/a/b/`, so its ids are the ancestors in order.
  const ancestorIds = issue.path.split("/").filter(Boolean);
  const ancestors = ancestorIds
    .map((id) => getIssue(id))
    .filter((i): i is Issue => i !== null);

  const children = listIssues(issue.projectId)
    .filter((i) => i.parentId === issue.id)
    .sort((a, b) => (a.rank < b.rank ? -1 : 1));

  return {
    issue,
    project,
    status: statusById[issue.statusId],
    statuses,
    statusById,
    people: project.people,
    ancestors,
    children,
  };
}

import "server-only";

import { getIssue, getIssueByKey, listIssues, listStatuses, mentionsForIssue, type Mention } from "./db";
import { buildSchedule, calendarOf, type Schedule, type WorkCalendar } from "./schedule";
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
  /** Where this issue has been talked about in the standup. */
  mentions: Mention[];
  /** The project's working day, for reading and writing estimates. */
  calendar: WorkCalendar;
  /**
   * The whole project's projection, not just this issue's: the ancestors' totals and
   * each child's own estimate are all on screen at once, and they only agree if they
   * come from one run of the scheduler.
   */
  schedule: Schedule;
}

/**
 * Everything the detail surface needs, from a display key like `GS-142`.
 *
 * `today` is an argument for the reason given on `relativeDayLabel`: read from a clock in
 * here, it would be the server's during SSR and the viewer's in the browser, and an
 * unanchored project schedule would differ between the two.
 */
export function loadIssueView(key: string, today: string): IssueView | null {
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

  const all = listIssues(issue.projectId);
  const children = all
    .filter((i) => i.parentId === issue.id)
    .sort((a, b) => (a.rank < b.rank ? -1 : 1));

  const calendar = calendarOf(project);

  return {
    calendar,
    schedule: buildSchedule(all, { calendar, startDate: project.scheduleStart ?? today }),
    issue,
    project,
    status: statusById[issue.statusId],
    statuses,
    statusById,
    people: project.people,
    ancestors,
    children,
    mentions: mentionsForIssue(issue.id),
  };
}

/**
 * Just the children's entries.
 *
 * The detail pane renders a badge per child and nothing else from the schedule, so only
 * this slice crosses to the client — a project with thousands of issues must not ship its
 * whole projection into the RSC payload to draw four badges.
 */
export function childSchedule(view: IssueView): Schedule {
  const out: Schedule = {};
  for (const child of view.children) {
    const entry = view.schedule[child.id];
    if (entry) out[child.id] = entry;
  }
  return out;
}

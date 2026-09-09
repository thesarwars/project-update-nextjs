import BacklogView from "@/components/issues/BacklogView";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  getSetting,
  listIssues,
  listSprints,
  listStatuses,
  orderDepthFirst,
  projectsVisibleTo,
  rollupByRoot,
  sprintByIssue,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Backlog · Standup" };

export default async function BacklogPage({ searchParams }: PageProps<"/backlog">) {
  const user = await requireUser("/backlog");
  const params = await searchParams;

  const projects = projectsVisibleTo(user);
  const requested = typeof params.project === "string" ? params.project : null;
  const last = getSetting("lastProjectId");
  const project =
    projects.find((p) => p.id === requested) ??
    projects.find((p) => p.id === last) ??
    projects[0];

  if (!project) {
    return <EmptyState title="No projects yet" body="Create a project first, in Settings." />;
  }

  const issues = orderDepthFirst(listIssues(project.id));
  const inSprint = sprintByIssue(project.id);
  const sprintIds: Record<string, string> = {};
  for (const [issueId, sprint] of Object.entries(inSprint)) sprintIds[issueId] = sprint.id;

  return (
    <BacklogView
      project={project}
      issues={issues}
      statuses={listStatuses(project.id)}
      rollups={rollupByRoot(project.id)}
      selectedId={null}
      sprints={listSprints(project.id).filter((s) => s.state !== "closed")}
      sprintByIssue={sprintIds}
    />
  );
}

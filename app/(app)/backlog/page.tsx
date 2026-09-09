import BacklogView from "@/components/issues/BacklogView";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSetting, listIssues, listStatuses, orderDepthFirst, projectsVisibleTo, rollupByRoot } from "@/lib/db";

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
  const rollups = rollupByRoot(project.id);

  return (
    <BacklogView
      project={project}
      issues={issues}
      statuses={listStatuses(project.id)}
      rollups={rollups}
      selectedId={null}
    />
  );
}

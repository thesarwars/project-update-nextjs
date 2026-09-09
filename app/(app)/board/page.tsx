import BoardView from "@/components/issues/BoardView";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSetting, listIssues, listStatuses, projectsVisibleTo } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Board · Standup" };

export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  const user = await requireUser("/board");
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

  const issues = listIssues(project.id);

  // "How much of this is not on the board" — the signal that a card has work elsewhere.
  const childCounts: Record<string, number> = {};
  for (const issue of issues) {
    if (issue.parentId) childCounts[issue.parentId] = (childCounts[issue.parentId] ?? 0) + 1;
  }

  return (
    <BoardView
      project={project}
      issues={issues}
      statuses={listStatuses(project.id)}
      childCounts={childCounts}
      selectedId={null}
    />
  );
}

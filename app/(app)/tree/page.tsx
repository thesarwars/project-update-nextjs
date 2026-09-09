import { cookies } from "next/headers";
import TreeView from "@/components/issues/TreeView";
import { treeCookieName } from "@/lib/tree";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSetting, listIssues, listStatuses, projectsVisibleTo, rollupByRoot } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tree · Standup" };

export default async function TreePage({ searchParams }: PageProps<"/tree">) {
  const user = await requireUser("/tree");
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

  // Expansion comes from the cookie so this render matches the client's first one.
  // Epics start open, which shows the shape of the work without a wall of rows.
  const saved = (await cookies()).get(treeCookieName(project.id))?.value;
  const expanded = new Set(saved ? decodeURIComponent(saved).split(",").filter(Boolean) : []);
  if (!saved) for (const issue of issues) if (issue.type === "epic") expanded.add(issue.id);

  const rootParam = typeof params.root === "string" ? params.root : null;
  const rootId = issues.some((i) => i.id === rootParam) ? rootParam : null;

  return (
    <TreeView
      project={project}
      issues={issues}
      statuses={listStatuses(project.id)}
      rollups={rollupByRoot(project.id)}
      rootId={rootId}
      selectedId={null}
      initialExpanded={[...expanded]}
    />
  );
}

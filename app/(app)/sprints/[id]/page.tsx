import Link from "next/link";
import { notFound } from "next/navigation";
import SprintDetail, { type ScopeRow } from "@/components/issues/SprintDetail";
import ViewToolbar from "@/components/shell/ViewToolbar";
import { requireUser } from "@/lib/auth";
import {
  getSprint,
  listIssues,
  listStatuses,
  sprintByIssue,
  sprintCounts,
  sprintEpicProgress,
  sprintScopeIds,
} from "@/lib/db";
import { canAccessProject, canManageProject } from "@/lib/permissions";
import type { Issue, Status } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/sprints/[id]">) {
  const { id } = await params;
  const sprint = getSprint(id);
  return { title: sprint ? `${sprint.name} · Sprints` : "Sprint" };
}

export default async function SprintPage({ params }: PageProps<"/sprints/[id]">) {
  const user = await requireUser();
  const { id } = await params;

  const sprint = getSprint(id);
  if (!sprint) notFound();
  if (!canAccessProject(user, sprint.projectId)) notFound();

  const issues = listIssues(sprint.projectId);
  const scope = new Set(sprintScopeIds(id));
  const elsewhere = sprintByIssue(sprint.projectId);

  /**
   * The scope, arranged so an epic reads whole.
   *
   * In-scope issues are shown in hierarchy order; a child of something in scope that is
   * *not* in this sprint is shown dimmed, with where it actually lives. Those ghosts are
   * context only — nothing counts them, which is what keeps the numbers arguable-proof.
   */
  const rows: ScopeRow[] = [];
  const inScope = issues.filter((i) => scope.has(i.id));
  const roots = inScope.filter((i) => !i.parentId || !scope.has(i.parentId));

  const walk = (issue: Issue, depth: number) => {
    rows.push({ issue, depth, ghost: false, elsewhere: null });
    const children = issues
      .filter((c) => c.parentId === issue.id)
      .sort((a, b) => (a.rank < b.rank ? -1 : 1));
    for (const child of children) {
      if (scope.has(child.id)) walk(child, depth + 1);
      else if (child.type !== "subtask") {
        rows.push({
          issue: child,
          depth: depth + 1,
          ghost: true,
          elsewhere: elsewhere[child.id]?.name ?? null,
        });
      }
    }
  };
  for (const root of roots.sort((a, b) => (a.rank < b.rank ? -1 : 1))) walk(root, 0);

  const statusById: Record<string, Status> = {};
  for (const status of listStatuses(sprint.projectId)) statusById[status.id] = status;

  return (
    <>
      <ViewToolbar>
        <Link href="/sprints" className="text-[12.5px] text-muted hover:text-foreground">
          ‹ Sprints
        </Link>
        <h1 className="text-[13px] font-semibold">{sprint.name}</h1>
      </ViewToolbar>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 thin-scroll">
        <SprintDetail
          sprint={sprint}
          rows={rows}
          counts={sprintCounts(id)}
          progress={sprintEpicProgress(id)}
          statusById={statusById}
          canManage={canManageProject(user)}
        />
      </div>
    </>
  );
}

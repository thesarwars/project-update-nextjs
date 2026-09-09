import SprintsView from "@/components/issues/SprintsView";
import { todayISO } from "@/lib/date";
import ViewToolbar from "@/components/shell/ViewToolbar";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSetting, listSprints, projectsVisibleTo, sprintCounts } from "@/lib/db";
import { canManageProject } from "@/lib/permissions";
import type { SprintCount } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sprints · Standup" };

export default async function SprintsPage({ searchParams }: PageProps<"/sprints">) {
  const user = await requireUser("/sprints");
  const params = await searchParams;

  const projects = projectsVisibleTo(user);
  const requested = typeof params.project === "string" ? params.project : null;
  const last = getSetting("lastProjectId");
  const project =
    projects.find((p) => p.id === requested) ??
    projects.find((p) => p.id === last) ??
    projects[0];

  if (!project) {
    return (
      <>
        <ViewToolbar>
          <h1 className="text-[13px] font-semibold">Sprints</h1>
        </ViewToolbar>
        <div className="p-4">
          <EmptyState title="No projects yet" body="Create a project first, in Settings." />
        </div>
      </>
    );
  }

  const sprints = listSprints(project.id);
  const counts: Record<string, SprintCount[]> = {};
  for (const sprint of sprints) counts[sprint.id] = sprintCounts(sprint.id);

  return (
    <>
      <ViewToolbar>
        <h1 className="text-[13px] font-semibold">Sprints</h1>
        <span className="text-[12px] text-muted">
          pick what is in, and the counts follow
        </span>
      </ViewToolbar>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 thin-scroll">
        <SprintsView
          projectId={project.id}
          sprints={sprints}
          counts={counts}
          canManage={canManageProject(user)}
          today={todayISO()}
        />
      </div>
    </>
  );
}

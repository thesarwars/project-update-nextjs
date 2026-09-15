import PeopleEditor from "@/components/team/PeopleEditor";
import ViewToolbar from "@/components/shell/ViewToolbar";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { accountsForProject, getSetting, listInvitesForProject, projectsVisibleTo } from "@/lib/db";
import { canManageProject } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata = { title: "People · Standup" };

export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  const user = await requireUser("/team");
  const params = await searchParams;

  const projects = projectsVisibleTo(user);
  const requested = typeof params.project === "string" ? params.project : null;
  const last = getSetting("lastProjectId");
  const project =
    projects.find((p) => p.id === requested) ??
    projects.find((p) => p.id === last) ??
    projects[0];

  return (
    <>
      <ViewToolbar>
        <h1 className="text-[13px] font-semibold">People</h1>
      </ViewToolbar>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 thin-scroll">
        {project ? (
          <PeopleEditor
            key={project.id}
            project={project}
            accounts={accountsForProject(project.id)}
            invites={canManageProject(user) ? listInvitesForProject(project.id) : []}
            canManage={canManageProject(user)}
          />
        ) : (
          <EmptyState title="No projects yet" body="Create a project first, in Settings." />
        )}
      </div>
    </>
  );
}

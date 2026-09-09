import ProjectSettingsPanel from "@/components/settings/ProjectSettingsPanel";
import ViewToolbar from "@/components/shell/ViewToolbar";
import { requireUser } from "@/lib/auth";
import { getSetting, projectsVisibleTo } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings · Standup" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireUser("/settings");
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
        <h1 className="text-[13px] font-semibold">Settings</h1>
      </ViewToolbar>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 thin-scroll">
        <ProjectSettingsPanel project={project} />
      </div>
    </>
  );
}

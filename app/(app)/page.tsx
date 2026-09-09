import Link from "next/link";
import Composer from "@/components/Composer";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSetting, projectsVisibleTo } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Standup" };

export default async function StandupPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser("/");
  const params = await searchParams;

  // The project comes from the URL so it survives a refresh and can be shared; the
  // remembered one is only the fallback.
  const projects = projectsVisibleTo(user);
  const requested = typeof params.project === "string" ? params.project : null;
  const last = getSetting("lastProjectId");
  const projectId =
    projects.find((p) => p.id === requested)?.id ??
    projects.find((p) => p.id === last)?.id ??
    projects[0]?.id ??
    null;

  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <EmptyState
          title="No projects yet"
          body="A project holds one team's standup — its people, its heading, and every day you write."
          action={
            <Link
              href="/settings"
              className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[13px] font-medium text-accent-contrast transition hover:brightness-110"
            >
              Create a project
            </Link>
          }
        />
      </div>
    );
  }

  return <Composer project={project} />;
}

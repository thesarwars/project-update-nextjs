import { cookies } from "next/headers";
import Link from "next/link";
import Composer from "@/components/Composer";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSetting, listIssues, openIssuesForPerson, projectsVisibleTo } from "@/lib/db";
import { isValidISODate, todayISO } from "@/lib/date";
import { PREFS_COOKIE, parsePrefs } from "@/lib/standupPrefs";
import type { Issue } from "@/lib/types";

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

  // Their own open work first, then everything else open, so the common case is one click.
  const openAll = listIssues(project.id).filter((i) => i.archivedAt === null);
  const issuesByPerson: Record<string, Issue[]> = {};
  for (const person of project.people) {
    const mine = openIssuesForPerson(project.id, person.id);
    const mineIds = new Set(mine.map((i) => i.id));
    issuesByPerson[person.id] = [...mine, ...openAll.filter((i) => !mineIds.has(i.id))].slice(0, 60);
  }

  // Both of these are read here rather than in the client, because this screen is
  // server-rendered: a date from window.location or preferences from localStorage would
  // make the first client render disagree with the HTML React just sent.
  const requestedDate = typeof params.date === "string" ? params.date : null;
  const initialDate = isValidISODate(requestedDate) ? requestedDate : todayISO();
  const initialPrefs = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);

  return (
    <Composer
      project={project}
      issuesByPerson={issuesByPerson}
      initialDate={initialDate}
      initialPrefs={initialPrefs}
    />
  );
}

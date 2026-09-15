import { notFound } from "next/navigation";
import IssueDetail from "@/components/issues/IssueDetail";
import ViewToolbar from "@/components/shell/ViewToolbar";
import { requireUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/permissions";
import { childSchedule, loadIssueView } from "@/lib/issueView";
import { todayISO } from "@/lib/date";
import { listHref, listViewFrom } from "@/lib/views";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/i/[key]">) {
  const { key } = await params;
  const view = loadIssueView(key, todayISO());
  return { title: view ? `${view.issue.key} · ${view.issue.title}` : "Issue" };
}

/** A pasted link or a refresh renders the same component full width. */
export default async function IssuePage({ params, searchParams }: PageProps<"/i/[key]">) {
  const user = await requireUser();
  const { key } = await params;
  const query = await searchParams;

  const view = loadIssueView(key, todayISO());
  if (!view) notFound();
  if (!canAccessProject(user, view.project.id)) notFound();

  // Only the URL survives a refresh, so `from` is the one thing that still knows which
  // list this was opened from. A pasted link carries nothing and falls back to the
  // backlog, which is the one view that holds every issue.
  const backHref = listHref(listViewFrom(query.from), {
    project: typeof query.project === "string" ? query.project : view.project.id,
    root: query.root,
  });

  return (
    <>
      <ViewToolbar>
        <h1 className="text-[13px] font-semibold">{view.issue.key}</h1>
        <span className="truncate text-[12.5px] text-muted">{view.project.name}</span>
      </ViewToolbar>
      <div className="min-h-0 flex-1 px-4 py-3">
        <IssueDetail
          key={view.issue.id}
          issue={view.issue}
          status={view.status}
          statuses={view.statuses}
          people={view.people}
          ancestors={view.ancestors}
          childIssues={view.children}
          statusById={view.statusById}
          mentions={view.mentions}
          calendar={view.calendar}
          entry={view.schedule[view.issue.id]}
          childEntries={childSchedule(view)}
          layout="page"
          backHref={backHref}
        />
      </div>
    </>
  );
}

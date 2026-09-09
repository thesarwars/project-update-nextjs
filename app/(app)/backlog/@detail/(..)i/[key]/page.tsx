import IssueDetail from "@/components/issues/IssueDetail";
import { requireUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/permissions";
import { loadIssueView } from "@/lib/issueView";

export const dynamic = "force-dynamic";

/**
 * Clicking an issue in the backlog lands here: the same route as the full page, rendered
 * beside the list instead of replacing it. The list keeps its scroll position, the URL is
 * real, and the back button closes the pane.
 */
export default async function InterceptedIssue({ params, searchParams }: PageProps<"/i/[key]">) {
  const user = await requireUser();
  const { key } = await params;
  const query = await searchParams;

  const view = loadIssueView(key);
  if (!view || !canAccessProject(user, view.project.id)) return null;

  const project = typeof query.project === "string" ? query.project : view.project.id;

  return (
    <div className="w-full border-l border-line px-3 py-3 lg:w-[440px] lg:overflow-y-auto thin-scroll">
      <IssueDetail
        key={view.issue.id}
        issue={view.issue}
        status={view.status}
        statuses={view.statuses}
        people={view.people}
        ancestors={view.ancestors}
        childIssues={view.children}
        statusById={view.statusById}
        layout="pane"
        backHref={`/backlog?project=${encodeURIComponent(project)}`}
      />
    </div>
  );
}

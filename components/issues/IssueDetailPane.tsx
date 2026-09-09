import IssueDetail from "./IssueDetail";
import { canAccessProject } from "@/lib/permissions";
import { loadIssueView } from "@/lib/issueView";
import type { User } from "@/lib/types";

/**
 * The right-hand pane, shared by every list that can open an issue.
 *
 * Parallel routes need one slot file per parent, so the route files stay thin and the
 * behaviour lives here — otherwise the backlog and the tree would drift apart.
 */
export default function IssueDetailPane({
  user,
  issueKey,
  backHref,
}: {
  user: User;
  issueKey: string;
  backHref: string;
}) {
  const view = loadIssueView(issueKey);
  if (!view || !canAccessProject(user, view.project.id)) return null;

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
        mentions={view.mentions}
        layout="pane"
        backHref={backHref}
      />
    </div>
  );
}

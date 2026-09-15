import DetailSlot from "./DetailSlot";
import IssueDetail from "./IssueDetail";
import { canAccessProject } from "@/lib/permissions";
import { childSchedule, loadIssueView } from "@/lib/issueView";
import { todayISO } from "@/lib/date";
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
  // A server component, so this clock read happens once and travels down as a prop —
  // the browser never reads its own, which is what keeps the two sides agreeing.
  const view = loadIssueView(issueKey, todayISO());
  if (!view || !canAccessProject(user, view.project.id)) return null;

  return (
    <DetailSlot>
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
          calendar={view.calendar}
          entry={view.schedule[view.issue.id]}
          childEntries={childSchedule(view)}
          layout="pane"
          backHref={backHref}
        />
      </div>
    </DetailSlot>
  );
}

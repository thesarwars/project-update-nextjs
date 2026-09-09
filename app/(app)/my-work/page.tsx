import Link from "next/link";
import IssueTypeIcon from "@/components/issues/IssueTypeIcon";
import PriorityIcon from "@/components/issues/PriorityIcon";
import StatusPill from "@/components/issues/StatusPill";
import ViewToolbar from "@/components/shell/ViewToolbar";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { issuesAssignedToUser, listStatuses, projectsVisibleTo } from "@/lib/db";
import { todayISO } from "@/lib/date";
import type { Status } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "My work · Standup" };

const GROUPS = [
  { category: "in_progress", title: "In progress" },
  { category: "todo", title: "To do" },
  { category: "done", title: "Recently finished" },
] as const;

export default async function MyWorkPage() {
  const user = await requireUser("/my-work");

  const issues = issuesAssignedToUser(user.id);
  const statusById: Record<string, Status> = {};
  for (const project of projectsVisibleTo(user)) {
    for (const status of listStatuses(project.id)) statusById[status.id] = status;
  }

  const firstProject = projectsVisibleTo(user)[0];
  const standupHref = firstProject
    ? `/?project=${encodeURIComponent(firstProject.id)}&date=${todayISO()}`
    : "/";

  return (
    <>
      <ViewToolbar>
        <h1 className="text-[13px] font-semibold">My work</h1>
        <span className="text-[12px] text-muted">everything assigned to you</span>
        <Link
          href={standupHref}
          className="ml-auto text-[12.5px] text-accent hover:underline"
        >
          Today&apos;s standup ›
        </Link>
      </ViewToolbar>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 thin-scroll">
        {issues.length === 0 ? (
          <EmptyState
            title="Nothing is assigned to you"
            body="Issues assigned to your name on a project roster show up here, ready to pull into the standup."
          />
        ) : (
          <div className="flex max-w-3xl flex-col gap-5">
            {GROUPS.map((group) => {
              const rows = issues.filter(
                (issue) => statusById[issue.statusId]?.category === group.category,
              );
              if (!rows.length) return null;
              return (
                <section key={group.category}>
                  <h2 className="mb-1 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {group.title}
                    <span className="tabular-nums">{rows.length}</span>
                  </h2>
                  <ul className="flex flex-col">
                    {rows.map((issue) => (
                      <li key={issue.id}>
                        <Link
                          href={`/i/${issue.key}`}
                          className="flex h-9 items-center gap-2 rounded-lg px-2 text-[13px] hover:bg-surface-sunken"
                        >
                          <IssueTypeIcon type={issue.type} />
                          <span className="shrink-0 font-mono text-[11.5px] text-muted">
                            {issue.key}
                          </span>
                          <span className="truncate">{issue.title}</span>
                          <span className="ml-auto flex shrink-0 items-center gap-2">
                            <PriorityIcon priority={issue.priority} />
                            {statusById[issue.statusId] ? (
                              <StatusPill status={statusById[issue.statusId]} />
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

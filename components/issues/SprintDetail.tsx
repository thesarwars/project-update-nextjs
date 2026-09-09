"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuX } from "react-icons/lu";
import IssueTypeIcon from "./IssueTypeIcon";
import StatusPill from "./StatusPill";
import SprintCounters from "./SprintCounters";
import { IconButton } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { formatDisplayDate } from "@/lib/date";
import type { Issue, Sprint, SprintCount, SprintEpicProgress, Status } from "@/lib/types";

export interface ScopeRow {
  issue: Issue;
  depth: number;
  /** A child of something in scope that is not itself in this sprint. */
  ghost: boolean;
  /** Where that child actually lives, for the chip on a ghost row. */
  elsewhere: string | null;
}

interface Props {
  sprint: Sprint;
  rows: ScopeRow[];
  counts: SprintCount[];
  progress: SprintEpicProgress[];
  statusById: Record<string, Status>;
  canManage: boolean;
}

export default function SprintDetail({
  sprint,
  rows,
  counts,
  progress,
  statusById,
  canManage,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const progressById = new Map(progress.map((p) => [p.issueId, p]));

  const remove = async (issueId: string) => {
    const res = await fetch(`/api/sprints/${sprint.id}/scope?issueId=${issueId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast("Could not take that out of the sprint.");
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-line bg-surface p-4 card-shadow">
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <h2 className="text-[15px] font-semibold">{sprint.name}</h2>
          <span className="text-[12.5px] text-muted">
            {sprint.startDate && sprint.endDate
              ? `${formatDisplayDate(sprint.startDate)} – ${formatDisplayDate(sprint.endDate)}`
              : "No dates set"}
          </span>
          {sprint.goal ? <span className="text-[12.5px] text-muted">· {sprint.goal}</span> : null}
        </div>
        <SprintCounters counts={counts} variant="full" />
      </section>

      <section className="rounded-xl border border-line bg-surface card-shadow">
        <header className="border-b border-line px-3 py-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted">Scope</h3>
        </header>

        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-muted">
            Nothing in this sprint yet. Pick issues from the backlog.
          </p>
        ) : (
          <ul className="flex flex-col py-1">
            {rows.map((row) => {
              const inSprint = progressById.get(row.issue.id);
              return (
                <li
                  key={`${row.issue.id}-${row.ghost ? "g" : "s"}`}
                  className={`group flex h-9 items-center gap-2 pr-2 text-[13px] ${
                    row.ghost ? "opacity-55" : ""
                  }`}
                  style={{ paddingLeft: 12 + row.depth * 18 }}
                >
                  {row.ghost ? <span aria-hidden className="text-muted">░</span> : null}
                  <IssueTypeIcon type={row.issue.type} />
                  <Link
                    href={`/i/${row.issue.key}`}
                    className="shrink-0 font-mono text-[11.5px] text-muted hover:text-foreground"
                  >
                    {row.issue.key}
                  </Link>
                  <span className="truncate">{row.issue.title}</span>

                  {/* Progress *inside this sprint*, so an epic spanning several does not
                      read as a failure three times running. */}
                  {inSprint && inSprint.inSprintChildren > 0 ? (
                    <span className="shrink-0 rounded border border-line px-1 text-[10.5px] tabular-nums text-muted">
                      {inSprint.inSprintDone}/{inSprint.inSprintChildren} in this sprint
                    </span>
                  ) : null}

                  {row.ghost ? (
                    <span className="shrink-0 rounded border border-line px-1 text-[10px] text-muted">
                      ⟨{row.elsewhere ?? "no sprint"}⟩
                    </span>
                  ) : null}

                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    {statusById[row.issue.statusId] ? (
                      <StatusPill status={statusById[row.issue.statusId]} />
                    ) : null}
                    {canManage && !row.ghost && sprint.state !== "closed" ? (
                      <IconButton
                        label={`Take ${row.issue.key} out of the sprint`}
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => void remove(row.issue.id)}
                      >
                        <LuX className="h-3.5 w-3.5" />
                      </IconButton>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
          Dimmed rows are children of something in this sprint that live elsewhere. They are
          shown so an epic reads whole, and they are never counted.
        </p>
      </section>
    </div>
  );
}

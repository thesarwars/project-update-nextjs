"use client";

import Link from "next/link";
import IssueTypeIcon, { relationshipLabel } from "./IssueTypeIcon";
import PriorityIcon from "./PriorityIcon";
import StatusPill from "./StatusPill";
import Avatar from "@/components/shell/Avatar";
import type { Issue, IssueType, Person, Status } from "@/lib/types";

interface Props {
  issue: Issue;
  status: Status | undefined;
  parentType: IssueType | null;
  assignee: Person | undefined;
  /** Descendant progress, for rows that have children. */
  rollup?: { total: number; done: number };
  selected: boolean;
  href: string;
}

export default function IssueRow({
  issue,
  status,
  parentType,
  assignee,
  rollup,
  selected,
  href,
}: Props) {
  const relationship = relationshipLabel(parentType, issue.type);

  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={`group flex h-9 items-center gap-2 rounded-lg pr-2 text-[13px] transition ${
        selected ? "bg-accent/10" : "hover:bg-surface-sunken"
      }`}
      style={{ paddingLeft: 8 + issue.depth * 18 }}
    >
      {/* A bug's own indent guide is tinted, so a bug subtree reads as one column. */}
      {issue.depth > 0 ? (
        <span
          aria-hidden
          className="-ml-2 h-5 w-px shrink-0"
          style={{ background: issue.type === "bug" ? "var(--type-bug)" : "var(--line)" }}
        />
      ) : null}

      <IssueTypeIcon type={issue.type} />
      <span className="shrink-0 font-mono text-[11.5px] text-muted">{issue.key}</span>
      <span className={`truncate ${status?.isDone ? "text-muted line-through" : ""}`}>
        {issue.title}
      </span>

      {relationship ? (
        <span className="shrink-0 rounded border border-line px-1 text-[10px] text-muted">
          ↳ {relationship}
        </span>
      ) : null}

      <span className="ml-auto flex shrink-0 items-center gap-2">
        {rollup && rollup.total > 0 ? (
          <span className="text-[11px] tabular-nums text-muted">
            {rollup.done}/{rollup.total}
          </span>
        ) : null}
        <PriorityIcon priority={issue.priority} />
        {status ? <StatusPill status={status} /> : null}
        {assignee ? (
          <Avatar name={assignee.name} size={20} />
        ) : (
          <span className="h-5 w-5 rounded-full border border-dashed border-line-strong" />
        )}
      </span>
    </Link>
  );
}

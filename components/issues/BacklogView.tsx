"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LuPlus } from "react-icons/lu";
import IssueRow from "./IssueRow";
import IssueTypeIcon from "./IssueTypeIcon";
import { Button, EmptyState, inputClass } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { ISSUE_TYPES, ROOT_TYPES, type Issue, type IssueType, type Project, type Status } from "@/lib/types";

interface Props {
  project: Project;
  issues: Issue[];
  statuses: Status[];
  rollups: Record<string, { total: number; done: number }>;
  selectedId: string | null;
}

export default function BacklogView({ project, issues, statuses, rollups, selectedId }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  const [type, setType] = useState<IssueType>("story");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const typeById = useMemo(() => new Map(issues.map((i) => [i.id, i.type])), [issues]);
  const peopleById = useMemo(() => new Map(project.people.map((p) => [p.id, p])), [project]);

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, type, title: title.trim() }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(error ?? "Could not create that issue.");
      }
      setTitle("");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create that issue.");
    } finally {
      setBusy(false);
    }
  };

  const hrefFor = (issue: Issue) => {
    const next = new URLSearchParams(params);
    return `/i/${issue.key}?${next}`;
  };

  return (
    <div className="flex flex-col gap-2">
      {issues.length === 0 ? (
        <EmptyState
          title="Nothing in the backlog yet"
          body="Add the first epic, then break it down. Bugs can sit wherever tasks sit."
        />
      ) : (
        <ul className="flex flex-col">
          {issues.map((issue) => (
            <li key={issue.id}>
              <IssueRow
                issue={issue}
                status={statusById.get(issue.statusId)}
                parentType={issue.parentId ? (typeById.get(issue.parentId) ?? null) : null}
                assignee={
                  issue.assigneePersonId ? peopleById.get(issue.assigneePersonId) : undefined
                }
                rollup={rollups[issue.id]}
                selected={selectedId === issue.id}
                href={hrefFor(issue)}
              />
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-2 py-2"
      >
        <label className="sr-only" htmlFor="new-issue-type">
          Type
        </label>
        <span className="pl-1">
          <IssueTypeIcon type={type} size={16} />
        </span>
        <select
          id="new-issue-type"
          value={type}
          onChange={(e) => setType(e.target.value as IssueType)}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent"
        >
          {ISSUE_TYPES.filter((t) => ROOT_TYPES.includes(t)).map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          className={inputClass}
        />
        <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
          <LuPlus className="h-3.5 w-3.5" />
          Add
        </Button>
      </form>
      <p className="px-1 text-[11px] text-muted">
        Only epics, stories, tasks and bugs can start at the top. Subtasks are added from an
        issue.
      </p>
    </div>
  );
}

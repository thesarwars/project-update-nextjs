"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuMaximize2, LuPlus, LuX } from "react-icons/lu";
import BulletEditor from "@/components/BulletEditor";
import IssueTypeIcon, { relationshipLabel } from "./IssueTypeIcon";
import PriorityIcon from "./PriorityIcon";
import StatusPill from "./StatusPill";
import Avatar from "@/components/shell/Avatar";
import { Button, IconButton, inputClass } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useReportSave } from "@/components/shell/SaveProvider";
import { useDebouncedSave } from "@/lib/useDebouncedSave";
import { formatDisplayDate } from "@/lib/date";
import type { Mention } from "@/lib/db";
import {
  DEFAULT_LABELS,
  PARENT_RULES,
  PRIORITIES,
  PRIORITY_LABELS,
  type Issue,
  type IssueType,
  type Person,
  type Status,
} from "@/lib/types";

interface Props {
  issue: Issue;
  status: Status | undefined;
  statuses: Status[];
  people: Person[];
  ancestors: Issue[];
  /** Not React children — the issue's own child issues. */
  childIssues: Issue[];
  statusById: Record<string, Status>;
  mentions: Mention[];
  /** "pane" sits beside the list; "page" is the full-width form after a refresh. */
  layout: "pane" | "page";
  backHref: string;
}

interface TextSave {
  id: string;
  field: "title" | "description";
  value: string;
  version: number;
}

async function saveText(item: TextSave): Promise<void> {
  const res = await fetch(`/api/issues/${item.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [item.field]: item.value }),
    keepalive: true,
  });
  if (!res.ok) throw new Error(`PATCH /api/issues -> ${res.status}`);
}

/**
 * Callers key this on the issue id. Opening a different issue in the same pane therefore
 * remounts it, which reseeds the title and description from their props — cleaner than
 * syncing them in an effect, and it cannot leave the previous issue's text on screen.
 */
export default function IssueDetail({
  issue,
  status,
  statuses,
  people,
  ancestors,
  childIssues,
  statusById,
  mentions,
  layout,
  backHref,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const reportSave = useReportSave();

  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description);
  const [childTitle, setChildTitle] = useState("");
  const [childType, setChildType] = useState<IssueType | null>(null);

  const { queue, state } = useDebouncedSave<TextSave>({ save: saveText });
  useEffect(() => reportSave(state), [state, reportSave]);

  const legalChildTypes = (Object.keys(PARENT_RULES) as IssueType[]).filter((child) =>
    PARENT_RULES[child].includes(issue.type),
  );

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast(error ?? "Could not save that change.");
        return;
      }
      router.refresh();
    },
    [issue.id, router, toast],
  );

  const addChild = async () => {
    const type = childType ?? legalChildTypes[0];
    if (!childTitle.trim() || !type) return;
    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: issue.projectId,
        type,
        title: childTitle.trim(),
        parentId: issue.id,
      }),
    });
    if (!res.ok) {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      toast(error ?? "Could not add that.");
      return;
    }
    setChildTitle("");
    router.refresh();
  };

  const wide = layout === "page";

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface card-shadow">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <nav aria-label="Ancestors" className="flex min-w-0 items-center gap-1 text-[11.5px] text-muted">
          {ancestors.map((a) => (
            <span key={a.id} className="flex min-w-0 items-center gap-1">
              <Link href={`/i/${a.key}`} className="flex min-w-0 items-center gap-1 hover:text-foreground">
                <IssueTypeIcon type={a.type} size={12} />
                <span className="truncate">{a.key}</span>
              </Link>
              <span aria-hidden>›</span>
            </span>
          ))}
          <span className="flex shrink-0 items-center gap-1 font-medium text-foreground">
            <IssueTypeIcon type={issue.type} size={12} />
            {issue.key}
          </span>
        </nav>

        <span className="ml-auto flex items-center gap-0.5">
          {layout === "pane" ? (
            <IconButton label="Open full page" variant="ghost" size="sm" onClick={() => router.push(`/i/${issue.key}`)}>
              <LuMaximize2 className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
          <IconButton label="Close" variant="ghost" size="sm" onClick={() => router.push(backHref)}>
            <LuX className="h-4 w-4" />
          </IconButton>
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 thin-scroll">
        <div className={wide ? "mx-auto grid max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_260px]" : "flex flex-col gap-4"}>
          <div className="flex flex-col gap-4">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                queue(`${issue.id}|title`, {
                  id: issue.id,
                  field: "title",
                  value: e.target.value,
                  version: issue.version,
                });
              }}
              aria-label="Title"
              className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-[16px] font-semibold outline-none hover:border-line focus:border-accent focus:bg-surface"
            />

            <div className="flex flex-col gap-1.5">
              <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Description
              </span>
              <BulletEditor
                value={description}
                onChange={(value) => {
                  setDescription(value);
                  queue(`${issue.id}|description`, {
                    id: issue.id,
                    field: "description",
                    value,
                    version: issue.version,
                  });
                }}
                label="Description"
                placeholder="What is this, and what does done look like?"
              />
            </div>

            <section className="flex flex-col gap-1.5">
              <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Children
              </span>
              {childIssues.length ? (
                <ul className="flex flex-col">
                  {childIssues.map((child) => {
                    const rel = relationshipLabel(issue.type, child.type);
                    return (
                      <li key={child.id}>
                        <Link
                          href={`/i/${child.key}`}
                          className="flex h-8 items-center gap-2 rounded-lg px-2 text-[12.5px] hover:bg-surface-sunken"
                        >
                          <IssueTypeIcon type={child.type} size={13} />
                          <span className="font-mono text-[11px] text-muted">{child.key}</span>
                          <span className="truncate">{child.title}</span>
                          {rel ? (
                            <span className="shrink-0 rounded border border-line px-1 text-[10px] text-muted">
                              ↳ {rel}
                            </span>
                          ) : null}
                          <span className="ml-auto shrink-0">
                            {statusById[child.statusId] ? (
                              <StatusPill status={statusById[child.statusId]} />
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {legalChildTypes.length ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addChild();
                  }}
                  className="flex items-center gap-2 px-2"
                >
                  <select
                    value={childType ?? legalChildTypes[0]}
                    onChange={(e) => setChildType(e.target.value as IssueType)}
                    aria-label="Child type"
                    className="h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent"
                  >
                    {legalChildTypes.map((t) => (
                      <option key={t} value={t}>
                        {t[0].toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={childTitle}
                    onChange={(e) => setChildTitle(e.target.value)}
                    placeholder="Add a child…"
                    className={inputClass}
                  />
                  <Button type="submit" disabled={!childTitle.trim()}>
                    <LuPlus className="h-3.5 w-3.5" />
                  </Button>
                </form>
              ) : (
                <p className="px-2 text-[12px] text-muted">A subtask cannot have children.</p>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-3">
            {mentions.length ? (
              <section className="order-last flex flex-col gap-1 border-t border-line pt-3">
                <span className="text-[11px] font-medium text-muted">Mentioned in standup</span>
                <ul className="flex flex-col gap-0.5">
                  {mentions.map((m) => (
                    <li key={`${m.date}-${m.personId}-${m.section}`} className="text-[12px]">
                      <Link
                        href={`/?project=${encodeURIComponent(issue.projectId)}&date=${m.date}`}
                        className="text-muted hover:text-foreground"
                      >
                        {formatDisplayDate(m.date)} — {m.personName},{" "}
                        {DEFAULT_LABELS[m.section as keyof typeof DEFAULT_LABELS] ?? m.section}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <Row label="Status">
              <select
                value={issue.statusId}
                onChange={(e) => void patch({ statusId: e.target.value })}
                aria-label="Status"
                className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Assignee">
              <select
                value={issue.assigneePersonId ?? ""}
                onChange={(e) => void patch({ assigneePersonId: e.target.value || null })}
                aria-label="Assignee"
                className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent"
              >
                <option value="">Unassigned</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Priority">
              <select
                value={issue.priority}
                onChange={(e) => void patch({ priority: Number(e.target.value) })}
                aria-label="Priority"
                className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </Row>

            <div className="flex items-center gap-2 px-0.5 pt-1">
              {status ? <StatusPill status={status} /> : null}
              <PriorityIcon priority={issue.priority} />
              {issue.assigneePersonId ? (
                <Avatar
                  name={people.find((p) => p.id === issue.assigneePersonId)?.name ?? "?"}
                  size={20}
                />
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

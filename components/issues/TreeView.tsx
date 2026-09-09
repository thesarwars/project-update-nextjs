"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LuChevronDown, LuChevronRight, LuCrosshair } from "react-icons/lu";
import IssueTypeIcon, { relationshipLabel } from "./IssueTypeIcon";
import PriorityIcon from "./PriorityIcon";
import StatusPill from "./StatusPill";
import Avatar from "@/components/shell/Avatar";
import { EmptyState, Key } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { EXPANDED_LIMIT, treeCookieName } from "@/lib/tree";
import { PARENT_RULES, ROOT_TYPES, type Issue, type IssueType, type Project, type Status } from "@/lib/types";

interface Props {
  project: Project;
  issues: Issue[];
  statuses: Status[];
  rollups: Record<string, { total: number; done: number }>;
  rootId: string | null;
  selectedId: string | null;
  /** Read from a cookie on the server, so the first client render matches the HTML. */
  initialExpanded: string[];
}

interface VisibleRow {
  issue: Issue;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /** Per ancestor level: does that ancestor have a sibling after it, and is it a bug? */
  guides: { continues: boolean; isBug: boolean }[];
}

interface Draft {
  parentId: string | null;
  /** The row the draft sits under, so it appears in the right place. */
  afterId: string | null;
  type: IssueType;
  title: string;
}

/** What a new child of this type usually is, so creating rarely needs the dropdown. */
function inferChildType(parentType: IssueType | null): IssueType {
  if (!parentType) return "epic";
  if (parentType === "epic") return "story";
  if (parentType === "story") return "task";
  if (parentType === "bug") return "bug";
  return "subtask";
}

const storageKey = treeCookieName;

export default function TreeView({
  project,
  issues,
  statuses,
  rollups,
  rootId,
  selectedId,
  initialExpanded,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialExpanded));
  const [focusIndex, setFocusIndex] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLInputElement>(null);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const peopleById = useMemo(() => new Map(project.people.map((p) => [p.id, p])), [project]);
  const byId = useMemo(() => new Map(issues.map((i) => [i.id, i])), [issues]);

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, Issue[]>();
    for (const issue of issues) {
      const key = issue.parentId && byId.has(issue.parentId) ? issue.parentId : null;
      const list = map.get(key) ?? [];
      list.push(issue);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.rank < b.rank ? -1 : 1));
    return map;
  }, [issues, byId]);

  /**
   * Expansion lives in a cookie rather than localStorage.
   *
   * The server renders these rows, so it has to know which branches are open — otherwise
   * the first client render disagrees with the HTML and React throws a hydration error.
   * A cookie is the only per-device store the server can read. It is capped because a
   * cookie is sent on every request and browsers cut it off around 4KB.
   */
  const persist = useCallback(
    (next: Set<string>) => {
      setExpanded(next);
      const value = [...next].slice(-EXPANDED_LIMIT).join(",");
      document.cookie = `${storageKey(project.id)}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
    },
    [project.id],
  );

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(expanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
    },
    [expanded, persist],
  );

  const rows = useMemo<VisibleRow[]>(() => {
    const out: VisibleRow[] = [];
    const walk = (
      parentId: string | null,
      depth: number,
      guides: { continues: boolean; isBug: boolean }[],
    ) => {
      const kids = childrenOf.get(parentId) ?? [];
      kids.forEach((issue, index) => {
        const hasChildren = (childrenOf.get(issue.id)?.length ?? 0) > 0;
        const isOpen = expanded.has(issue.id);
        out.push({ issue, depth, hasChildren, expanded: isOpen, guides });
        if (hasChildren && isOpen) {
          walk(issue.id, depth + 1, [
            ...guides,
            { continues: index < kids.length - 1, isBug: issue.type === "bug" },
          ]);
        }
      });
    };
    if (rootId) {
      // Focused: show the focused issue itself, then its subtree beneath it.
      const focused = byId.get(rootId);
      if (focused) {
        const hasChildren = (childrenOf.get(rootId)?.length ?? 0) > 0;
        out.push({ issue: focused, depth: 0, hasChildren, expanded: true, guides: [] });
        walk(rootId, 1, []);
        return out;
      }
    }
    walk(null, 0, []);
    return out;
  }, [childrenOf, expanded, rootId, byId]);

  const hrefFor = (issue: Issue) => `/i/${issue.key}?${params}`;

  const create = useCallback(
    async (current: Draft, then: "sibling" | "close") => {
      const title = current.title.trim();
      if (!title) {
        setDraft(null);
        return;
      }
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          type: current.type,
          title,
          parentId: current.parentId,
        }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast(error ?? "Could not add that.");
        return;
      }
      const { issue } = (await res.json()) as { issue: Issue };
      if (current.parentId) {
        const next = new Set(expanded);
        next.add(current.parentId);
        persist(next);
      }
      setDraft(
        then === "sibling"
          ? { parentId: current.parentId, afterId: issue.id, type: current.type, title: "" }
          : null,
      );
      router.refresh();
    },
    [project.id, expanded, persist, router, toast],
  );

  const openDraft = useCallback(
    (anchor: Issue | null, mode: "child" | "sibling") => {
      if (!anchor) {
        setDraft({ parentId: rootId, afterId: null, type: inferChildType(null), title: "" });
        return;
      }
      if (mode === "child") {
        const type = inferChildType(anchor.type);
        if (!PARENT_RULES[type].includes(anchor.type)) {
          toast(`A ${anchor.type} cannot have children.`);
          return;
        }
        setDraft({ parentId: anchor.id, afterId: null, type, title: "" });
        const next = new Set(expanded);
        next.add(anchor.id);
        persist(next);
      } else {
        setDraft({
          parentId: anchor.parentId,
          afterId: anchor.id,
          type: anchor.type,
          title: "",
        });
      }
    },
    [rootId, expanded, persist, toast],
  );

  useEffect(() => {
    if (draft) draftRef.current?.focus();
  }, [draft]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (draft) return; // the draft input has its own grammar
    const row = rows[focusIndex];
    const move = (delta: number) =>
      setFocusIndex((i) => Math.max(0, Math.min(rows.length - 1, i + delta)));

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "ArrowRight":
        if (!row) break;
        event.preventDefault();
        if (row.hasChildren && !row.expanded) toggle(row.issue.id);
        else if (row.hasChildren) move(1);
        break;
      case "ArrowLeft": {
        if (!row) break;
        event.preventDefault();
        if (row.expanded) toggle(row.issue.id);
        else {
          const parent = rows.findIndex((r) => r.issue.id === row.issue.parentId);
          if (parent >= 0) setFocusIndex(parent);
        }
        break;
      }
      case "Home":
        event.preventDefault();
        setFocusIndex(0);
        break;
      case "End":
        event.preventDefault();
        setFocusIndex(rows.length - 1);
        break;
      case "Enter":
        if (!row) break;
        event.preventDefault();
        router.push(hrefFor(row.issue));
        break;
      case "c":
        if (!row || event.metaKey || event.ctrlKey) break;
        event.preventDefault();
        openDraft(row.issue, event.shiftKey ? "sibling" : "child");
        break;
      default:
        break;
    }
  };

  const focusRoot = rootId ? byId.get(rootId) : undefined;

  return (
    <div className="flex flex-col gap-2">
      {focusRoot ? (
        <div className="flex items-center gap-2 rounded-lg bg-surface-sunken px-2 py-1.5 text-[12px]">
          <LuCrosshair className="h-3.5 w-3.5 text-muted" />
          <span className="text-muted">Focused on</span>
          <IssueTypeIcon type={focusRoot.type} size={13} />
          <span className="font-mono text-[11px]">{focusRoot.key}</span>
          <span className="truncate">{focusRoot.title}</span>
          <Link
            href={`/tree?project=${encodeURIComponent(project.id)}`}
            className="ml-auto shrink-0 text-accent hover:underline"
          >
            Show everything
          </Link>
        </div>
      ) : null}

      {rows.length === 0 && !draft ? (
        <EmptyState
          title="Your work has no shape yet"
          body="Start with an epic, then break it down. Press c on a row to add a child."
        />
      ) : null}

      <div
        ref={listRef}
        role="tree"
        aria-label="Issue hierarchy"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="flex flex-col rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        {rows.map((row, index) => (
          <TreeRow
            key={row.issue.id}
            row={row}
            focused={index === focusIndex && !draft}
            selected={row.issue.id === selectedId}
            status={statusById.get(row.issue.statusId)}
            parentType={row.issue.parentId ? (byId.get(row.issue.parentId)?.type ?? null) : null}
            assigneeName={
              row.issue.assigneePersonId
                ? peopleById.get(row.issue.assigneePersonId)?.name
                : undefined
            }
            rollup={rollups[row.issue.id]}
            href={hrefFor(row.issue)}
            projectId={project.id}
            onToggle={() => toggle(row.issue.id)}
            onFocus={() => setFocusIndex(index)}
            onAddChild={() => openDraft(row.issue, "child")}
          >
            {draft && draft.afterId === row.issue.id ? (
              <DraftRow
                ref={draftRef}
                draft={draft}
                depth={draft.parentId === row.issue.parentId ? row.depth : row.depth + 1}
                onChange={(title) => setDraft({ ...draft, title })}
                onSubmit={(then) => void create(draft, then)}
                onCancel={() => setDraft(null)}
              />
            ) : null}
          </TreeRow>
        ))}

        {draft && draft.afterId === null ? (
          <DraftRow
            ref={draftRef}
            draft={draft}
            depth={draft.parentId ? (byId.get(draft.parentId)?.depth ?? 0) + 1 : 0}
            onChange={(title) => setDraft({ ...draft, title })}
            onSubmit={(then) => void create(draft, then)}
            onCancel={() => setDraft(null)}
          />
        ) : null}
      </div>

      {!draft ? (
        <button
          type="button"
          onClick={() => openDraft(focusRoot ?? null, "child")}
          className="self-start rounded-lg px-2 py-1 text-[12.5px] text-muted transition hover:bg-surface-sunken hover:text-foreground"
        >
          + Add {focusRoot ? `a child of ${focusRoot.key}` : ROOT_TYPES[0]}
        </button>
      ) : null}

      <p className="px-1 pt-1 text-[11px] text-muted">
        <Key>↑</Key> <Key>↓</Key> move · <Key>←</Key> <Key>→</Key> collapse and expand ·{" "}
        <Key>Enter</Key> open · <Key>c</Key> add a child · <Key>Shift</Key>+<Key>c</Key> add a
        sibling
      </p>
    </div>
  );
}

interface RowProps {
  row: VisibleRow;
  focused: boolean;
  selected: boolean;
  status: Status | undefined;
  parentType: IssueType | null;
  assigneeName: string | undefined;
  rollup?: { total: number; done: number };
  href: string;
  projectId: string;
  onToggle: () => void;
  onFocus: () => void;
  onAddChild: () => void;
  children?: React.ReactNode;
}

function TreeRow({
  row,
  focused,
  selected,
  status,
  parentType,
  assigneeName,
  rollup,
  href,
  projectId,
  onToggle,
  onFocus,
  onAddChild,
  children,
}: RowProps) {
  const { issue, depth, hasChildren, expanded, guides } = row;
  const relationship = relationshipLabel(parentType, issue.type);

  return (
    <>
      <div
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={selected}
        onMouseDown={onFocus}
        className={`group flex h-9 items-center rounded-lg pr-2 text-[13px] transition ${
          selected ? "bg-accent/10" : focused ? "bg-surface-sunken" : "hover:bg-surface-sunken"
        }`}
      >
        {/* Guides are real elements, one per ancestor level, so they cannot drift out of
            step with the rows the way absolutely positioned lines do. */}
        {guides.map((guide, i) => (
          <span key={i} className="flex h-full w-[18px] shrink-0 justify-center" aria-hidden>
            {guide.continues ? (
              <span
                className="h-full w-px"
                style={{ background: guide.isBug ? "var(--type-bug)" : "var(--line)" }}
              />
            ) : null}
          </span>
        ))}

        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "Collapse" : "Expand"}
          tabIndex={-1}
          className={`grid h-5 w-5 shrink-0 place-items-center rounded text-muted ${
            hasChildren ? "hover:bg-line" : "invisible"
          }`}
        >
          {expanded ? (
            <LuChevronDown className="h-3.5 w-3.5" />
          ) : (
            <LuChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <Link href={href} className="flex min-w-0 flex-1 items-center gap-2">
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
        </Link>

        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onAddChild}
            tabIndex={-1}
            title="Add a child"
            className="hidden h-5 w-5 place-items-center rounded text-muted hover:bg-line group-hover:grid"
          >
            +
          </button>
          <Link
            href={`/tree?project=${encodeURIComponent(projectId)}&root=${issue.id}`}
            tabIndex={-1}
            title="Focus on this branch"
            className="hidden h-5 w-5 place-items-center rounded text-muted hover:bg-line group-hover:grid"
          >
            <LuCrosshair className="h-3 w-3" />
          </Link>
          {rollup && rollup.total > 0 ? (
            <span className="text-[11px] tabular-nums text-muted">
              {rollup.done}/{rollup.total}
            </span>
          ) : null}
          <PriorityIcon priority={issue.priority} />
          {status ? <StatusPill status={status} /> : null}
          {assigneeName ? (
            <Avatar name={assigneeName} size={20} />
          ) : (
            <span className="h-5 w-5 rounded-full border border-dashed border-line-strong" />
          )}
        </span>
      </div>
      {children}
    </>
  );
}

/**
 * The create row, using the grammar already in the author's fingers from BulletEditor:
 * Enter finishes this one and opens the next, Tab and Shift+Tab change the level, Escape
 * abandons it.
 */
const DraftRow = ({
  ref,
  draft,
  depth,
  onChange,
  onSubmit,
  onCancel,
}: {
  ref: React.Ref<HTMLInputElement>;
  draft: Draft;
  depth: number;
  onChange: (title: string) => void;
  onSubmit: (then: "sibling" | "close") => void;
  onCancel: () => void;
}) => (
  <div className="flex h-9 items-center gap-2 rounded-lg" style={{ paddingLeft: depth * 18 + 20 }}>
    <IssueTypeIcon type={draft.type} />
    <input
      ref={ref}
      value={draft.title}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onSubmit(draft.title.trim() ? "sibling" : "close");
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => onSubmit("close")}
      placeholder={`New ${draft.type}…`}
      aria-label={`New ${draft.type}`}
      className="h-7 min-w-0 flex-1 rounded-lg border border-accent bg-surface px-2 text-[13px] outline-none"
    />
    <span className="shrink-0 text-[10.5px] text-muted">Enter saves · Esc cancels</span>
  </div>
);

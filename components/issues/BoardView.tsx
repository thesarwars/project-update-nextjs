"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import IssueTypeIcon from "./IssueTypeIcon";
import PriorityIcon from "./PriorityIcon";
import Avatar from "@/components/shell/Avatar";
import { EmptyState, Key } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useDragList, type DropTarget } from "@/lib/useDragList";
import type { Issue, Project, Status } from "@/lib/types";

interface Props {
  project: Project;
  issues: Issue[];
  statuses: Status[];
  childCounts: Record<string, number>;
  selectedId: string | null;
}

interface Position {
  column: number;
  index: number;
}

export default function BoardView({ project, issues, statuses, childCounts, selectedId }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  /** Optimistic overrides, so a drop paints before the server answers. */
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<Position>({ column: 0, index: 0 });
  const [held, setHeld] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const boardRef = useRef<HTMLDivElement>(null);

  const peopleById = useMemo(() => new Map(project.people.map((p) => [p.id, p])), [project]);

  const columns = useMemo(
    () =>
      statuses.map((status) => ({
        status,
        cards: issues
          .filter((issue) => (moved[issue.id] ?? issue.statusId) === status.id)
          .sort((a, b) => (a.rank < b.rank ? -1 : 1)),
      })),
    [statuses, issues, moved],
  );

  const apply = useCallback(
    async (id: string, statusId: string, beforeId: string | null) => {
      setMoved((m) => ({ ...m, [id]: statusId }));
      const res = await fetch(`/api/issues/${id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId, beforeId }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        setMoved((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
        toast(error ?? "Could not move that.");
        return;
      }
      router.refresh();
    },
    [router, toast],
  );

  const onDrop = useCallback(
    (id: string, target: DropTarget) => void apply(id, target.columnId, target.beforeId),
    [apply],
  );
  const { dragging, start } = useDragList({ onDrop });

  const cardAt = (position: Position) => columns[position.column]?.cards[position.index];

  /**
   * The keyboard path, shipped with the drag rather than after it.
   *
   * Alt+arrows move a card directly, which is what people actually use. Space picks a
   * card up and announces each step through a live region, for anyone navigating without
   * a pointer. Both end in the same call as a drop, so the two can never diverge.
   */
  const onKeyDown = (event: React.KeyboardEvent) => {
    const card = cardAt(focus);

    if (event.key === "Escape" && held) {
      event.preventDefault();
      setHeld(null);
      setAnnouncement("Cancelled.");
      return;
    }

    if (event.key === " " && card) {
      event.preventDefault();
      if (held === card.id) {
        setHeld(null);
        setAnnouncement(`Dropped ${card.key} in ${columns[focus.column].status.name}.`);
      } else {
        setHeld(card.id);
        setAnnouncement(
          `Picked up ${card.key}. Position ${focus.index + 1} of ${columns[focus.column].cards.length} in ${columns[focus.column].status.name}.`,
        );
      }
      return;
    }

    if (event.key === "Enter" && card) {
      event.preventDefault();
      router.push(`/i/${card.key}?${params}`);
      return;
    }

    const horizontal = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const vertical = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (!horizontal && !vertical) return;
    event.preventDefault();

    const moving = event.altKey || held !== null;
    const target = held ? issues.find((i) => i.id === held) : card;
    if (moving && target) {
      const columnIndex = Math.max(
        0,
        Math.min(columns.length - 1, focus.column + horizontal),
      );
      const column = columns[columnIndex];
      const others = column.cards.filter((c) => c.id !== target.id);
      const index = horizontal
        ? others.length
        : Math.max(0, Math.min(others.length, focus.index + vertical));
      void apply(target.id, column.status.id, others[index]?.id ?? null);
      setFocus({ column: columnIndex, index });
      setAnnouncement(
        `${target.key} moved to ${column.status.name}, position ${index + 1} of ${others.length + 1}.`,
      );
      return;
    }

    if (horizontal) {
      const columnIndex = Math.max(0, Math.min(columns.length - 1, focus.column + horizontal));
      setFocus({
        column: columnIndex,
        index: Math.min(focus.index, Math.max(0, columns[columnIndex].cards.length - 1)),
      });
    } else {
      setFocus({
        column: focus.column,
        index: Math.max(
          0,
          Math.min(columns[focus.column].cards.length - 1, focus.index + vertical),
        ),
      });
    }
  };

  if (!issues.length) {
    return (
      <EmptyState
        title="Nothing on the board"
        body="Issues appear here as soon as there are some. Add one from the backlog."
      />
    );
  }

  return (
    <>
      <div
        ref={boardRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Board"
        className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2 outline-none focus-visible:ring-2 focus-visible:ring-accent/30 thin-scroll"
      >
        {columns.map((column, columnIndex) => (
          <section
            key={column.status.id}
            data-column={column.status.id}
            aria-label={column.status.name}
            className={`flex w-[264px] shrink-0 flex-col rounded-xl border bg-surface-sunken/60 ${
              dragging?.target?.columnId === column.status.id
                ? "border-accent"
                : "border-transparent"
            }`}
          >
            <header className="flex items-center gap-2 px-3 py-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: column.status.color }}
              />
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                {column.status.name}
              </h2>
              <span className="ml-auto text-[11px] tabular-nums text-muted">
                {column.cards.length}
              </span>
            </header>

            <div className="flex min-h-[60px] flex-col gap-2 px-2 pb-2">
              {column.cards.map((issue, index) => {
                const focused = focus.column === columnIndex && focus.index === index;
                return (
                  <article
                    key={issue.id}
                    data-card={issue.id}
                    onPointerDown={(e) => start(e, issue.id)}
                    onMouseDown={() => setFocus({ column: columnIndex, index })}
                    aria-grabbed={held === issue.id}
                    className={`cursor-grab select-none rounded-lg border bg-surface p-2 card-shadow transition ${
                      dragging?.id === issue.id ? "opacity-40" : ""
                    } ${
                      held === issue.id
                        ? "border-accent ring-2 ring-accent/30"
                        : focused
                          ? "border-accent"
                          : selectedId === issue.id
                            ? "border-accent/50"
                            : "border-line"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <IssueTypeIcon type={issue.type} size={13} />
                      <Link
                        href={`/i/${issue.key}?${params}`}
                        className="font-mono text-[11px] text-muted hover:text-foreground"
                      >
                        {issue.key}
                      </Link>
                      <span className="ml-auto">
                        <PriorityIcon priority={issue.priority} />
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.35]">{issue.title}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      {childCounts[issue.id] ? (
                        <span
                          className="text-[10.5px] text-muted"
                          title={`${childCounts[issue.id]} child issues`}
                        >
                          ⌂{childCounts[issue.id]}
                        </span>
                      ) : null}
                      <span className="ml-auto">
                        {issue.assigneePersonId ? (
                          <Avatar
                            name={peopleById.get(issue.assigneePersonId)?.name ?? "?"}
                            size={18}
                          />
                        ) : (
                          <span className="block h-[18px] w-[18px] rounded-full border border-dashed border-line-strong" />
                        )}
                      </span>
                    </div>
                  </article>
                );
              })}

              {dragging?.target?.columnId === column.status.id && !column.cards.length ? (
                <div className="rounded-lg border border-dashed border-accent/50 py-4 text-center text-[11px] text-accent">
                  Drop here
                </div>
              ) : null}
            </div>
          </section>
        ))}
      </div>

      {dragging ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 rounded-lg border border-accent bg-surface p-2 text-[12.5px] card-shadow"
          style={{
            left: dragging.x + 8,
            top: dragging.y + 8,
            width: dragging.width,
          }}
        >
          {issues.find((i) => i.id === dragging.id)?.title}
        </div>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <p className="pt-1 text-[11px] text-muted">
        Drag a card, or use the keyboard: <Key>←</Key> <Key>→</Key> <Key>↑</Key> <Key>↓</Key> to
        move around, <Key>⌥</Key>+arrows to move the card, <Key>Space</Key> to pick it up and
        drop it, <Key>Enter</Key> to open.
      </p>
    </>
  );
}

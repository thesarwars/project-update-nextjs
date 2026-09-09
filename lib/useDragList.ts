"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface DropTarget {
  /** The column the pointer is over. */
  columnId: string;
  /** The card the dragged one should land in front of, or null for the end. */
  beforeId: string | null;
}

interface Options {
  onDrop: (id: string, target: DropTarget) => void;
}

interface Dragging {
  id: string;
  x: number;
  y: number;
  width: number;
  target: DropTarget | null;
}

const THRESHOLD = 5;

/**
 * Pointer-event dragging for a set of columns.
 *
 * Not the HTML5 drag-and-drop API: it has no touch support at all, its drag image cannot
 * be styled, and `dragover` fires in storms across nested targets. Pointer events give
 * touch for free and let the ghost be an ordinary element.
 *
 * Not a library either — yet. The board is uniform-height cards in sorted columns, the
 * easy case. The hard case is re-parenting in a tree, and that is when a dependency
 * earns its place.
 *
 * Columns are marked with `data-column`, cards with `data-card`. The hook reads the DOM
 * under the pointer rather than tracking rectangles, so it stays correct while the list
 * reflows underneath it.
 */
export function useDragList({ onDrop }: Options) {
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const origin = useRef<{ x: number; y: number; id: string } | null>(null);
  const armed = useRef(false);

  const findTarget = useCallback((x: number, y: number, draggedId: string): DropTarget | null => {
    const stack = document.elementsFromPoint(x, y);
    const columnEl = stack.find((el) => el instanceof HTMLElement && el.dataset.column) as
      | HTMLElement
      | undefined;
    if (!columnEl) return null;

    const columnId = columnEl.dataset.column!;
    const cards = [...columnEl.querySelectorAll<HTMLElement>("[data-card]")].filter(
      (el) => el.dataset.card !== draggedId,
    );

    // Land in front of the first card whose middle is below the pointer.
    for (const card of cards) {
      const box = card.getBoundingClientRect();
      if (y < box.top + box.height / 2) return { columnId, beforeId: card.dataset.card! };
    }
    return { columnId, beforeId: null };
  }, []);

  const start = useCallback((event: React.PointerEvent, id: string) => {
    // Left button only, and never from a control inside the card.
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, a, select, input")) return;
    origin.current = { x: event.clientX, y: event.clientY, id };
    armed.current = true;
  }, []);

  useEffect(() => {
    if (!armed.current && !dragging) return;

    const move = (event: PointerEvent) => {
      const from = origin.current;
      if (!from) return;

      if (!dragging) {
        const far =
          Math.abs(event.clientX - from.x) > THRESHOLD ||
          Math.abs(event.clientY - from.y) > THRESHOLD;
        if (!far) return;
        const card = document.querySelector<HTMLElement>(`[data-card="${from.id}"]`);
        setDragging({
          id: from.id,
          x: event.clientX,
          y: event.clientY,
          width: card?.getBoundingClientRect().width ?? 240,
          target: findTarget(event.clientX, event.clientY, from.id),
        });
        return;
      }

      setDragging({
        ...dragging,
        x: event.clientX,
        y: event.clientY,
        target: findTarget(event.clientX, event.clientY, dragging.id),
      });
    };

    const finish = () => {
      if (dragging?.target) onDrop(dragging.id, dragging.target);
      origin.current = null;
      armed.current = false;
      setDragging(null);
    };

    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      origin.current = null;
      armed.current = false;
      setDragging(null);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel as unknown as EventListener);
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel as unknown as EventListener);
      window.removeEventListener("keydown", cancel);
    };
  }, [dragging, findTarget, onDrop]);

  return { dragging, start };
}

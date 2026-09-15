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
 * Eat the click the browser fires at the end of a drag.
 *
 * Cards open on click. When a drop ends over the card it started on — a small reorder,
 * or a drag that changed its mind — the browser still dispatches a click there, and the
 * card would open as if it had been clicked. The click arrives in the same task as the
 * pointerup, so a capture-phase listener catches it; the timeout forgets it if none comes.
 */
function swallowNextClick(): void {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
}

/**
 * Pointer-event dragging for a set of columns.
 *
 * Not the HTML5 drag-and-drop API: its drag image cannot be styled and `dragover` fires
 * in storms across nested targets. Pointer events let the ghost be an ordinary element.
 * (They do not make touch work by themselves — a finger on a card scrolls the page and
 * the browser cancels the pointer — so this is a mouse and trackpad gesture; the
 * keyboard path in BoardView covers everything else.)
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

  // The window listeners live for one gesture and are attached from the pointerdown
  // handler itself. They used to be attached by an effect keyed on a ref set there — but
  // setting a ref does not render, so the effect never re-ran, nothing listened for
  // pointermove, and no drag ever started. Listeners read the latest callback from here.
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  const detachRef = useRef<(() => void) | null>(null);
  useEffect(() => () => detachRef.current?.(), []);

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

  const start = useCallback(
    (event: React.PointerEvent, id: string) => {
      // Primary button of the primary pointer only, and never from a control in the card.
      if (event.button !== 0 || !event.isPrimary) return;
      if ((event.target as HTMLElement).closest("button, a, select, input, textarea")) return;

      detachRef.current?.();

      const pointerId = event.pointerId;
      const originX = event.clientX;
      const originY = event.clientY;
      // The gesture's own copy of the state. React state is for painting; the handlers
      // must not depend on a render having happened between two pointer events.
      let current: Dragging | null = null;

      const move = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        if (!current) {
          const far =
            Math.abs(e.clientX - originX) > THRESHOLD || Math.abs(e.clientY - originY) > THRESHOLD;
          if (!far) return;
          const card = document.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
          current = {
            id,
            x: e.clientX,
            y: e.clientY,
            width: card?.getBoundingClientRect().width ?? 240,
            target: null,
          };
        }
        current = {
          ...current,
          x: e.clientX,
          y: e.clientY,
          target: findTarget(e.clientX, e.clientY, id),
        };
        setDragging(current);
      };

      const end = (commit: boolean) => {
        detach();
        const finished = current;
        current = null;
        setDragging(null);
        // Below the threshold this was a click, not a drag: nothing moves, and the click
        // goes through to open the card.
        if (finished) swallowNextClick();
        if (commit && finished?.target) onDropRef.current(finished.id, finished.target);
      };

      const up = (e: PointerEvent) => {
        if (e.pointerId === pointerId) end(true);
      };
      const cancel = (e: PointerEvent) => {
        if (e.pointerId === pointerId) end(false);
      };
      const escape = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        const wasDragging = current !== null;
        end(false);
        // The button is usually still down. Releasing it later over the card would click
        // it open, which is not what cancelling a drag means.
        if (wasDragging) {
          window.addEventListener("pointerup", swallowNextClick, { capture: true, once: true });
        }
      };
      // Sweeping across column headers otherwise selects their text mid-drag.
      const noSelect = (e: Event) => {
        if (current) e.preventDefault();
      };

      function detach() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", escape);
        document.removeEventListener("selectstart", noSelect);
        if (detachRef.current === detach) detachRef.current = null;
      }

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", escape);
      document.addEventListener("selectstart", noSelect);
      detachRef.current = detach;
    },
    [findTarget],
  );

  return { dragging, start };
}

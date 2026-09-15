"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface Options<T> {
  /**
   * Persist one queued item. Throw to signal failure.
   *
   * Must be stable across renders — define it at module scope, or wrap it in a
   * `useCallback` with stable dependencies. An unstable `save` makes `flush` unstable,
   * which re-registers the unload listeners on every render.
   */
  save: (item: T) => Promise<void>;
  delayMs?: number;
}

export const DEFAULT_SAVE_DELAY_MS = 500;

/**
 * Debounced write-behind for anything edited at keystroke rate.
 *
 * Pending items are keyed, so many edits to one field coalesce into a single write while
 * edits to different fields stay separate. A failed flush puts its items back rather than
 * dropping them, and never overwrites a newer edit that arrived while the request was in
 * flight — so a save that fails is invisible to someone who keeps typing.
 *
 * Flushes on `visibilitychange` and `pagehide` with `keepalive`, so closing the tab does
 * not lose the last few keystrokes. That is why this path stays on `fetch` rather than
 * moving to a Server Function, which cannot be sent with `keepalive`.
 */
export function useDebouncedSave<T>({ save, delayMs = DEFAULT_SAVE_DELAY_MS }: Options<T>) {
  const pending = useRef(new Map<string, T>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<SaveState>("idle");

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const items = [...pending.current.entries()];
    if (!items.length) return;
    pending.current.clear();
    setState("saving");

    try {
      await Promise.all(items.map(([, item]) => save(item)));
      setState(pending.current.size ? "saving" : "saved");
    } catch {
      // Put them back so the next keystroke retries; never clobber newer edits.
      for (const [key, item] of items) {
        if (!pending.current.has(key)) pending.current.set(key, item);
      }
      setState("error");
    }
  }, [save]);

  const queue = useCallback(
    (key: string, item: T) => {
      pending.current.set(key, item);
      setState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [flush, delayMs],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onUnload = () => void flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onUnload);
    };
  }, [flush]);

  return { queue, flush, state };
}

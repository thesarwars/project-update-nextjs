"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { BULLET, INDENT, itemsToRaw, parseItems } from "@/lib/format";

const EMPTY_BULLET = /^[ \t]*[-*•][ \t]*$/;
const ONLY_INDENT = /^[ \t]+$/;
const BULLET_PREFIX = /^[ \t]*[-*•][ \t]+$/;
const STARTS_WITH_MARKER = /^[ \t]*(?:[-*•]|\d{1,3}[.)])[ \t]/;

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  minRows?: number;
}

/**
 * A textarea that behaves like a bullet list.
 *
 *   Enter        finish this point and start the next one (`- `)
 *   Shift+Enter  wrap onto another line inside the *same* point (indented)
 *   Enter on an empty point exits the list, the way every editor does it.
 *
 * Edits go through `document.execCommand` where possible so the browser's own
 * undo stack keeps working — rebuilding the value in React state would throw it away.
 */
export default function BulletEditor({ value, onChange, label, placeholder, minRows = 2 }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<number | null>(null);

  const autosize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    autosize();
    if (pendingSelection.current !== null && ref.current) {
      const pos = Math.min(pendingSelection.current, ref.current.value.length);
      ref.current.setSelectionRange(pos, pos);
      pendingSelection.current = null;
    }
  }, [value, autosize]);

  useEffect(() => {
    const onResize = () => autosize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [autosize]);

  /** Replace [start, end) with `insert`, preserving native undo when we can. */
  const applyEdit = useCallback(
    (start: number, end: number, insert: string) => {
      const el = ref.current;
      if (!el) return;
      if (start === end && insert === "") return;

      el.focus();
      el.setSelectionRange(start, end);

      let handled = false;
      try {
        handled =
          insert === ""
            ? document.execCommand("delete")
            : document.execCommand("insertText", false, insert);
      } catch {
        handled = false;
      }
      if (handled) return; // the resulting `input` event drives onChange

      const next = el.value.slice(0, start) + insert + el.value.slice(end);
      pendingSelection.current = start + insert.length;
      onChange(next);
    },
    [onChange],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = event.currentTarget;

    if (event.key === "Enter") {
      if (event.nativeEvent.isComposing) return; // mid-IME composition
      if (event.metaKey || event.ctrlKey || event.altKey) return; // leave shortcuts alone
      event.preventDefault();

      const { selectionStart: start, selectionEnd: end, value: text } = el;

      if (event.shiftKey) {
        applyEdit(start, end, "\n" + INDENT);
        return;
      }

      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const nextBreak = text.indexOf("\n", end);
      const lineEnd = nextBreak === -1 ? text.length : nextBreak;
      const line = text.slice(lineStart, lineEnd);
      const collapsed = start === end;

      if (collapsed && (EMPTY_BULLET.test(line) || ONLY_INDENT.test(line))) {
        applyEdit(lineStart, lineEnd, ""); // nothing on this point — leave the list
        return;
      }
      if (!text.trim()) {
        applyEdit(0, text.length, BULLET);
        return;
      }
      applyEdit(start, end, "\n" + BULLET);
      return;
    }

    if (event.key === "Backspace" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const { selectionStart: start, selectionEnd: end, value: text } = el;
      if (start !== end) return;
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const before = text.slice(lineStart, start);
      if (BULLET_PREFIX.test(before) || ONLY_INDENT.test(before)) {
        event.preventDefault();
        applyEdit(lineStart, start, ""); // eat the whole marker, not one space of it
      }
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData("text/plain");
    if (!pasted || !/[\r\n]/.test(pasted)) return; // single line: nothing to tidy

    const items = parseItems(pasted);
    if (!items.length) return;
    event.preventDefault();

    const el = event.currentTarget;
    const { selectionStart: start, selectionEnd: end, value: text } = el;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const before = text.slice(lineStart, start);

    let insert = itemsToRaw(items);
    if (BULLET_PREFIX.test(before) || EMPTY_BULLET.test(before)) {
      insert = insert.slice(BULLET.length); // cursor already sits on a marker
    } else if (before.trim()) {
      insert = "\n" + insert; // mid-point: start the paste on its own line
    }
    applyEdit(start, end, insert);
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    // First keystroke into an empty field opens the list for you.
    if (
      !value.trim() &&
      next.trim() &&
      !next.includes("\n") &&
      !STARTS_WITH_MARKER.test(next)
    ) {
      pendingSelection.current = (event.target.selectionStart ?? next.length) + BULLET.length;
      onChange(BULLET + next);
      return;
    }
    onChange(next);
  };

  const handleBlur = () => {
    // A lone marker left behind by an abandoned point is just noise.
    if (value && EMPTY_BULLET.test(value)) onChange("");
  };

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onBlur={handleBlur}
      aria-label={label}
      placeholder={placeholder}
      rows={minRows}
      spellCheck
      className="w-full resize-none rounded-lg border border-transparent bg-surface-sunken px-3 py-2 font-sans text-[13.5px] leading-6 text-foreground outline-none transition placeholder:text-muted/70 hover:border-line focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/20"
    />
  );
}

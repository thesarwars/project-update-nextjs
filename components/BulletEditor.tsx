"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { BULLET, INDENT, LIST_MARKER, blocksToRaw, indentWidth, parseBlocks } from "@/lib/format";

const EMPTY_BULLET = /^[ \t]*[-*•][ \t]*$/;
const ONLY_INDENT = /^[ \t]+$/;
const BULLET_PREFIX = /^[ \t]*[-*•][ \t]+$/;
/** A line that already opens a point: marker followed by a space. */
const MARKED_LINE = /^[ \t]*(?:[-*•]|\d{1,3}[.)])[ \t]/;
/** As above, but a bare `-` with nothing after it counts too — it is a marker in progress. */
const MARKER_STARTED = /^[ \t]*(?:[-*•]|\d{1,3}[.)])(?:[ \t]|$)/;

const leadingWhitespace = (line: string) => line.match(/^[ \t]*/)![0];
const depthOf = (line: string) => Math.floor(indentWidth(leadingWhitespace(line)) / 2);

/**
 * How deep the point above this line sits, so Tab can never indent a point past
 * the one it would nest under. -1 means there is nothing above to nest into.
 */
function depthAbove(text: string, lineStart: number): number {
  if (lineStart === 0) return -1;
  const lines = text.slice(0, lineStart - 1).split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const marked = lines[i].match(LIST_MARKER);
    if (marked) return Math.floor(indentWidth(marked[1]) / 2);
    // A sub-header at the margin starts a fresh run of points.
    if (lines[i].trim() && !/^[ \t]/.test(lines[i])) return -1;
  }
  return -1;
}

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
 *   Enter        finish this point, start the next one (`- `)
 *   Shift+Enter  wrap onto another line inside the *same* point (indented)
 *   Enter on an empty point exits the list, the way every editor does it.
 *
 * Every edit goes through `document.execCommand` so the browser's own undo stack
 * keeps working — rebuilding the value in React state would throw it away.
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

  /** Put `- ` in front of a field the user has started typing into unprompted. */
  const openList = useCallback(
    (el: HTMLTextAreaElement) => {
      const caret = (el.selectionStart ?? el.value.length) + BULLET.length;
      applyEdit(0, 0, BULLET);
      // After applyEdit, so it wins over the fallback path's own caret guess.
      pendingSelection.current = caret;
    },
    [applyEdit],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = event.currentTarget;

    if (event.key === "Enter") {
      if (event.nativeEvent.isComposing) return; // mid-IME composition
      if (event.metaKey || event.ctrlKey || event.altKey) return; // leave shortcuts alone
      event.preventDefault();

      const { selectionStart: start, selectionEnd: end, value: text } = el;

      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const nextBreak = text.indexOf("\n", end);
      const lineEnd = nextBreak === -1 ? text.length : nextBreak;
      const line = text.slice(lineStart, lineEnd);
      const lead = leadingWhitespace(line);
      const collapsed = start === end;

      if (event.shiftKey) {
        applyEdit(start, end, "\n" + lead + INDENT); // same point, next line, aligned under it
        return;
      }

      if (collapsed && (EMPTY_BULLET.test(line) || ONLY_INDENT.test(line))) {
        const depth = depthOf(line);
        if (EMPTY_BULLET.test(line) && depth > 0) {
          // An empty sub-point steps back out a level before leaving the list.
          applyEdit(lineStart, lineEnd, INDENT.repeat(depth - 1) + BULLET);
          return;
        }
        applyEdit(lineStart, lineEnd, ""); // nothing on this point — leave the list
        return;
      }
      if (!text.trim()) {
        applyEdit(0, text.length, BULLET);
        return;
      }
      if (collapsed && start === lineStart && MARKED_LINE.test(line)) {
        // Caret parked in front of an existing marker. Inserting "\n- " here would
        // put a second marker ahead of this one and the first would be read as the
        // bullet, leaving a literal "- " inside the item text. Open a point above
        // instead, which is what every list editor does.
        applyEdit(lineStart, lineStart, lead + BULLET + "\n");
        return;
      }
      applyEdit(start, end, "\n" + lead + BULLET); // stay at this nesting level
      return;
    }

    if (event.key === "Tab") {
      const { selectionStart: start, selectionEnd: end, value: text } = el;
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const nextBreak = text.indexOf("\n", end);
      const line = text.slice(lineStart, nextBreak === -1 ? text.length : nextBreak);
      // Only points move. On a sub-header or an empty field Tab still moves focus,
      // so the keyboard is never trapped in here.
      if (!MARKED_LINE.test(line)) return;

      const lead = leadingWhitespace(line);
      const depth = depthOf(line);
      if (event.shiftKey) {
        if (depth === 0) return; // nothing to outdent — let focus move back instead
        event.preventDefault();
        applyEdit(lineStart, lineStart + lead.length, INDENT.repeat(depth - 1));
        return;
      }
      if (depth > depthAbove(text, lineStart)) return; // no point above to nest under
      event.preventDefault();
      applyEdit(lineStart, lineStart + lead.length, INDENT.repeat(depth + 1));
      return;
    }

    if (event.key === "Escape") {
      el.blur(); // the way out for anyone tabbing through the page
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

    const blocks = parseBlocks(pasted, { bareLineIsHeader: false });
    if (!blocks.length) return;
    event.preventDefault();

    const el = event.currentTarget;
    const { selectionStart: start, selectionEnd: end, value: text } = el;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const before = text.slice(lineStart, start);

    let insert = blocksToRaw(blocks);
    if (BULLET_PREFIX.test(before) || EMPTY_BULLET.test(before)) {
      insert = insert.slice(BULLET.length); // cursor already sits on a marker
    } else if (before.trim()) {
      insert = "\n" + insert; // mid-point: start the paste on its own line
    }
    applyEdit(start, end, insert);
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    // First keystroke into an empty field opens the list for you. Never mid-composition:
    // rewriting the value under an IME scrambles what it is still assembling.
    if (
      !(event.nativeEvent as InputEvent).isComposing &&
      !value.trim() &&
      next.trim() &&
      !next.includes("\n") &&
      !MARKER_STARTED.test(next)
    ) {
      openList(event.target);
      return;
    }
    onChange(next);
  };

  const handleCompositionEnd = (event: React.CompositionEvent<HTMLTextAreaElement>) => {
    // The keystroke path above stands aside for IME input, so the marker for a field
    // composed from scratch gets added once the composition is committed.
    const el = event.currentTarget;
    const text = el.value;
    if (!text.trim() || text.includes("\n") || MARKER_STARTED.test(text)) return;
    openList(el);
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
      onCompositionEnd={handleCompositionEnd}
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

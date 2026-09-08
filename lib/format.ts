import { DEFAULT_LABELS, SECTION_KEYS, type Entry, type Person, type Project } from "./types";
import { formatDisplayDate } from "./date";

export const BULLET = "- ";
export const INDENT = "  ";

/** Matches a leading list marker: `-`, `*`, `•`, `1.`, `2)` … */
const MARKER = /^[ \t]*(?:[-*•‣▪·]|\d{1,3}[.)])(?:[ \t]+(.*))?$/;

/**
 * Editor text -> list items.
 *
 * A line with a list marker starts an item. An indented line continues the item
 * above it (that is what Shift+Enter produces). A bare unmarked line at the
 * margin is its own item, so pasted plain text still parses sensibly.
 */
export function parseItems(raw: string): string[] {
  if (!raw) return [];
  const items: string[] = [];
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const marked = line.match(MARKER);
    if (marked) {
      items.push((marked[1] ?? "").trim());
      continue;
    }
    if (!line.trim()) continue; // blank lines are just breathing room
    if (/^[ \t]+\S/.test(line) && items.length) {
      items[items.length - 1] += "\n" + line.trim();
      continue;
    }
    items.push(line.trim());
  }
  return items.map((i) => i.trim()).filter(Boolean);
}

/** Items -> editor text, the inverse of `parseItems`. */
export function itemsToRaw(items: string[]): string {
  return items
    .map((item) =>
      item
        .split("\n")
        .map((line, i) => (i === 0 ? BULLET + line : INDENT + line))
        .join("\n"),
    )
    .join("\n");
}

/* ------------------------------------------------------------------ *
 * Document model — built once, then rendered into each copy flavor.
 * ------------------------------------------------------------------ */

export interface DocSection {
  label: string;
  items: string[];
}
export interface DocBlock {
  personId: string;
  name: string;
  sections: DocSection[];
}
export interface StandupDoc {
  title: string;
  dateLine: string;
  blocks: DocBlock[];
}

export interface RenderOptions {
  includeHeader: boolean;
  /** Drop a section with no items instead of printing a placeholder. */
  omitEmptySections: boolean;
  /** Drop a person who has nothing in either section. */
  omitEmptyPeople: boolean;
  /** Printed after the label when a section is empty and `omitEmptySections` is off. */
  emptyPlaceholder: string;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  includeHeader: true,
  omitEmptySections: true,
  omitEmptyPeople: true,
  emptyPlaceholder: "-",
};

export interface RenderInput {
  project: Project;
  dateISO: string;
  people: Person[];
  entries: Record<string, Entry>;
}

export function buildDoc(input: RenderInput, o: RenderOptions): StandupDoc {
  const { project, dateISO, people, entries } = input;

  const title = (project.titleTemplate || "")
    .replaceAll("{project}", project.name)
    .replaceAll("{date}", formatDisplayDate(dateISO))
    .trim();

  const section = (label: string, items: string[]): DocSection[] => {
    if (items.length === 0) {
      return o.omitEmptySections ? [] : [{ label, items: [o.emptyPlaceholder] }];
    }
    return [{ label, items }];
  };

  const blocks: DocBlock[] = [];
  for (const person of people) {
    if (!person.active) continue;
    const entry = entries[person.id];
    const parsed = SECTION_KEYS.map((key) => ({
      label: project.labels[key] || DEFAULT_LABELS[key],
      items: parseItems(entry?.[key] ?? ""),
    }));
    if (o.omitEmptyPeople && parsed.every((s) => s.items.length === 0)) continue;
    blocks.push({
      personId: person.id,
      name: person.name,
      sections: parsed.flatMap((s) => section(s.label, s.items)),
    });
  }

  return {
    title: o.includeHeader ? title : "",
    dateLine: o.includeHeader ? `Date: ${formatDisplayDate(dateISO)}` : "",
    blocks,
  };
}

export function docIsEmpty(doc: StandupDoc): boolean {
  return doc.blocks.length === 0;
}

/* ------------------------------------------------------------------ *
 * Text flavors
 * ------------------------------------------------------------------ */

export type CopyFlavor = "rich" | "markdown" | "whatsapp" | "plain";

export const FLAVORS: { id: CopyFlavor; label: string; hint: string }[] = [
  { id: "rich", label: "Rich text", hint: "Discord, Slack, Docs, Notion, email — formats on paste" },
  { id: "markdown", label: "Markdown", hint: "**bold** and - bullets" },
  { id: "whatsapp", label: "WhatsApp", hint: "*bold* and • bullets" },
  { id: "plain", label: "Plain", hint: "No markup at all" },
];

interface TextStyle {
  strong: (s: string) => string;
  bullet: string;
  /** Indent applied to continuation lines inside one bullet. */
  contIndent: string;
}

const TEXT_STYLES: Record<Exclude<CopyFlavor, "rich">, TextStyle> = {
  markdown: { strong: (s) => `**${s}**`, bullet: "- ", contIndent: "  " },
  whatsapp: { strong: (s) => `*${s}*`, bullet: "• ", contIndent: "  " },
  plain: { strong: (s) => s, bullet: "- ", contIndent: "  " },
};

function renderText(doc: StandupDoc, flavor: Exclude<CopyFlavor, "rich">): string {
  const st = TEXT_STYLES[flavor];
  const groups: string[] = [];

  const header = [doc.title, doc.dateLine].filter(Boolean).map(st.strong);
  if (header.length) groups.push(header.join("\n"));

  for (const block of doc.blocks) {
    const lines: string[] = [st.strong(`${block.name}:`)];
    for (const sec of block.sections) {
      lines.push(st.strong(`${sec.label}:`));
      for (const item of sec.items) {
        lines.push(
          item
            .split("\n")
            .map((l, i) => (i === 0 ? st.bullet + l : st.contIndent + l))
            .join("\n"),
        );
      }
    }
    groups.push(lines.join("\n"));
  }

  return groups.join("\n\n");
}

/** The plain-text half of a rich copy: markdown, which Discord renders natively. */
export function renderPlainText(doc: StandupDoc, flavor: CopyFlavor = "rich"): string {
  return renderText(doc, flavor === "rich" ? "markdown" : flavor);
}

/* ------------------------------------------------------------------ *
 * HTML flavor (the `text/html` clipboard payload and the live preview)
 * ------------------------------------------------------------------ */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const UL_STYLE = "margin:0 0 0 0;padding-left:26px;";
const LI_STYLE = "margin:0;padding:0;";

/**
 * Clipboard HTML. Deliberately boring markup — <b>, <div>, <ul>/<li> with inline
 * styles — because that is what Slack, Discord, Google Docs and mail clients all
 * agree on when converting a paste into their own formatting.
 */
export function renderHtml(doc: StandupDoc): string {
  const out: string[] = [];
  const line = (html: string) => out.push(`<div>${html}</div>`);
  const spacer = () => out.push("<div><br></div>");

  const header = [doc.title, doc.dateLine].filter(Boolean);
  header.forEach((h) => line(`<b>${escapeHtml(h)}</b>`));

  doc.blocks.forEach((block, i) => {
    if (i > 0 || header.length) spacer();
    line(`<b>${escapeHtml(block.name)}:</b>`);
    for (const sec of block.sections) {
      line(`<b>${escapeHtml(sec.label)}:</b>`);
      const lis = sec.items
        .map((item) => {
          const html = item.split("\n").map(escapeHtml).join("<br>");
          return `<li style="${LI_STYLE}">${html}</li>`;
        })
        .join("");
      out.push(`<ul style="${UL_STYLE}">${lis}</ul>`);
    }
  });

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.45;">${out.join("")}</div>`;
}

/* ------------------------------------------------------------------ *
 * Single-person helpers (per-card copy)
 * ------------------------------------------------------------------ */

export function buildPersonDoc(
  input: RenderInput,
  personId: string,
  o: RenderOptions,
): StandupDoc {
  const person = input.people.find((p) => p.id === personId);
  if (!person) return { title: "", dateLine: "", blocks: [] };
  return buildDoc(
    { ...input, people: [{ ...person, active: true }] },
    { ...o, includeHeader: false, omitEmptyPeople: false },
  );
}

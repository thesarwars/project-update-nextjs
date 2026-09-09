import { DEFAULT_LABELS, SECTION_KEYS, type Entry, type Person, type Project } from "./types";
import { formatDisplayDate } from "./date";

export const BULLET = "- ";
export const INDENT = "  ";

/** `[1]` = leading whitespace, `[2]` = text after the marker. */
export const LIST_MARKER = /^([ \t]*)(?:[-*•‣▪·◦]|\d{1,3}[.)])(?:[ \t]+(.*))?$/;

/** Strips the bold/heading markup someone may have typed around a sub-header. */
const HEADING_HASHES = /^#{1,6}[ \t]*/;
const WRAPPED_BOLD = /^(?:\*\*(.+)\*\*|__(.+)__|\*(.+)\*)$/;

/** A point, which may carry sub-points of its own. `text` holds Shift+Enter lines. */
export interface BulletNode {
  text: string;
  children: BulletNode[];
}

/** A sub-header groups the points under it; an item is a point at the margin. */
export type Block = { kind: "header"; text: string } | { kind: "item"; node: BulletNode };

/** Columns of leading whitespace, counting a tab as two. Two columns per level. */
export function indentWidth(whitespace: string): number {
  let width = 0;
  for (const ch of whitespace) width += ch === "\t" ? 2 : 1;
  return width;
}

/** Markup with nothing inside it — `****`, `##`, `---` — is not a header, it is noise. */
const ONLY_MARKUP = /^[\s*_#-]*$/;

function headerText(line: string): string {
  let text = line.replace(HEADING_HASHES, "").trim();
  // Unwrap repeatedly so `***text***` loses both layers.
  for (let i = 0; i < 3; i += 1) {
    const wrapped = text.match(WRAPPED_BOLD);
    if (!wrapped) break;
    text = (wrapped[1] ?? wrapped[2] ?? wrapped[3]).trim();
  }
  return ONLY_MARKUP.test(text) ? "" : text;
}

export interface ParseOptions {
  /**
   * True for editor text, where deleting a `- ` turns the line into a sub-header.
   * False when normalising a paste, where an unmarked line is just another point.
   */
  bareLineIsHeader: boolean;
}

/**
 * Editor text -> blocks.
 *
 *   `- point`        a point
 *   `  - sub-point`  nested under the point above (two spaces per level)
 *   `  more words`   a Shift+Enter line, still part of the point above
 *   `Heading`        a line at the margin with no marker: a sub-header
 */
export function parseBlocks(
  raw: string,
  { bareLineIsHeader = true }: Partial<ParseOptions> = {},
): Block[] {
  if (!raw) return [];
  const blocks: Block[] = [];
  /** stack[d] is the most recent point at depth d, so children can be attached. */
  const stack: BulletNode[] = [];

  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) continue; // blank lines are just breathing room

    const marked = line.match(LIST_MARKER);
    if (marked) {
      const node: BulletNode = { text: (marked[2] ?? "").trim(), children: [] };
      // Clamp, so over-indenting a point cannot invent a level that has no parent.
      const depth = Math.min(Math.floor(indentWidth(marked[1]) / 2), stack.length);
      if (depth === 0) blocks.push({ kind: "item", node });
      else stack[depth - 1].children.push(node);
      stack.length = depth;
      stack.push(node);
      continue;
    }

    const indent = line.match(/^[ \t]*/)![0];
    if (indentWidth(indent) > 0 && stack.length) {
      stack[stack.length - 1].text += "\n" + line.trim(); // Shift+Enter continuation
      continue;
    }

    if (bareLineIsHeader) {
      blocks.push({ kind: "header", text: headerText(line.trim()) });
      stack.length = 0;
    } else {
      const node: BulletNode = { text: line.trim(), children: [] };
      blocks.push({ kind: "item", node });
      stack.length = 0;
      stack.push(node);
    }
  }

  return pruneBlocks(blocks);
}

function pruneNodes(nodes: BulletNode[]): BulletNode[] {
  const out: BulletNode[] = [];
  for (const node of nodes) {
    const children = pruneNodes(node.children);
    const text = node.text.trim();
    // An abandoned `- ` disappears, but anything nested under it moves up a level
    // rather than vanishing with it.
    if (!text) out.push(...children);
    else out.push({ text, children });
  }
  return out;
}

function pruneBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    if (block.kind === "header") {
      if (block.text.trim()) out.push({ kind: "header", text: block.text.trim() });
      continue;
    }
    for (const node of pruneNodes([block.node])) out.push({ kind: "item", node });
  }
  return out;
}

/** Blocks -> editor text, the inverse of `parseBlocks`. */
export function blocksToRaw(blocks: Block[]): string {
  const lines: string[] = [];
  const walk = (nodes: BulletNode[], depth: number) => {
    for (const node of nodes) {
      const pad = INDENT.repeat(depth);
      const parts = node.text.split("\n");
      lines.push(pad + BULLET + parts[0]);
      for (const part of parts.slice(1)) lines.push(pad + INDENT + part);
      walk(node.children, depth + 1);
    }
  };
  for (const block of blocks) {
    if (block.kind === "header") lines.push(block.text);
    else walk([block.node], 0);
  }
  return lines.join("\n");
}

/** Every point in a field, nested ones included — for the per-person counts. */
export function countBullets(raw: string): number {
  let total = 0;
  const walk = (nodes: BulletNode[]) => {
    for (const node of nodes) {
      total += 1;
      walk(node.children);
    }
  };
  for (const block of parseBlocks(raw)) if (block.kind === "item") walk([block.node]);
  return total;
}

/* ------------------------------------------------------------------ *
 * Document model — built once, then rendered into each copy flavor.
 * ------------------------------------------------------------------ */

export interface DocSection {
  label: string;
  blocks: Block[];
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
  /** Drop a section with nothing in it instead of printing a placeholder. */
  omitEmptySections: boolean;
  /** Drop a person who has nothing in any section. */
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

  const section = (label: string, blocks: Block[]): DocSection[] => {
    if (blocks.length === 0) {
      return o.omitEmptySections
        ? []
        : [{ label, blocks: [{ kind: "item", node: { text: o.emptyPlaceholder, children: [] } }] }];
    }
    return [{ label, blocks }];
  };

  const blocks: DocBlock[] = [];
  for (const person of people) {
    if (!person.active) continue;
    const entry = entries[person.id];
    const parsed = SECTION_KEYS.map((key) => ({
      label: project.labels[key] || DEFAULT_LABELS[key],
      blocks: parseBlocks(entry?.[key] ?? ""),
    }));
    if (o.omitEmptyPeople && parsed.every((s) => s.blocks.length === 0)) continue;
    blocks.push({
      personId: person.id,
      name: person.name,
      sections: parsed.flatMap((s) => section(s.label, s.blocks)),
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
  {
    id: "rich",
    label: "Rich text",
    hint: "Discord, Slack, Docs, Notion, email — formats and nests on paste",
  },
  { id: "markdown", label: "Markdown", hint: "**bold** and - bullets, nested by indent" },
  { id: "whatsapp", label: "WhatsApp", hint: "*bold* and • bullets — WhatsApp cannot nest lists" },
  { id: "plain", label: "Plain", hint: "No markup at all" },
];

interface TextStyle {
  strong: (s: string) => string;
  /** Sub-points get a different glyph where the target cannot nest a real list. */
  bullet: (depth: number) => string;
}

const WHATSAPP_BULLETS = ["• ", "◦ ", "▪ "];

const TEXT_STYLES: Record<Exclude<CopyFlavor, "rich">, TextStyle> = {
  markdown: { strong: (s) => `**${s}**`, bullet: () => "- " },
  whatsapp: {
    strong: (s) => `*${s}*`,
    bullet: (d) => WHATSAPP_BULLETS[Math.min(d, WHATSAPP_BULLETS.length - 1)],
  },
  plain: { strong: (s) => s, bullet: () => "- " },
};

function renderNodes(nodes: BulletNode[], st: TextStyle, depth: number): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    const pad = INDENT.repeat(depth);
    const parts = node.text.split("\n");
    out.push(pad + st.bullet(depth) + parts[0]);
    for (const part of parts.slice(1)) out.push(pad + INDENT + part);
    out.push(...renderNodes(node.children, st, depth + 1));
  }
  return out;
}

function renderSectionText(sec: DocSection, st: TextStyle): string[] {
  const out: string[] = [st.strong(`${sec.label}:`)];
  for (const block of sec.blocks) {
    if (block.kind === "header") out.push(st.strong(block.text));
    else out.push(...renderNodes([block.node], st, 0));
  }
  return out;
}

function renderText(doc: StandupDoc, flavor: Exclude<CopyFlavor, "rich">): string {
  const st = TEXT_STYLES[flavor];
  const groups: string[] = [];

  const header = [doc.title, doc.dateLine].filter(Boolean).map(st.strong);
  if (header.length) groups.push(header.join("\n"));

  for (const block of doc.blocks) {
    const lines: string[] = [st.strong(`${block.name}:`)];
    for (const sec of block.sections) lines.push(...renderSectionText(sec, st));
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
const NESTED_UL_STYLE = "margin:0;padding-left:22px;";
const LI_STYLE = "margin:0;padding:0;";

function nodesToHtml(nodes: BulletNode[], depth: number): string {
  const items = nodes
    .map((node) => {
      const body = node.text.split("\n").map(escapeHtml).join("<br>");
      const nested = node.children.length ? nodesToHtml(node.children, depth + 1) : "";
      return `<li style="${LI_STYLE}">${body}${nested}</li>`;
    })
    .join("");
  return `<ul style="${depth === 0 ? UL_STYLE : NESTED_UL_STYLE}">${items}</ul>`;
}

/**
 * Clipboard HTML. Deliberately boring markup — <b>, <div>, <ul>/<li> with inline
 * styles — because that is what Slack, Discord, Google Docs and mail clients all
 * agree on when converting a paste into their own formatting. Nested <ul> inside
 * <li> is how each of them represents a sub-point.
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
      // Consecutive points share one <ul>; a sub-header breaks the run and starts a new one.
      let run: BulletNode[] = [];
      const flush = () => {
        if (run.length) out.push(nodesToHtml(run, 0));
        run = [];
      };
      for (const item of sec.blocks) {
        if (item.kind === "header") {
          flush();
          line(`<b>${escapeHtml(item.text)}</b>`);
        } else {
          run.push(item.node);
        }
      }
      flush();
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

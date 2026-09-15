/**
 * Which list an issue was opened from, carried in the URL as `from`.
 *
 * Clicking an issue in a list is intercepted into a pane, so closing it is a back
 * navigation and the list is still there. A refresh is not intercepted — the same URL
 * renders the full page instead — and at that point the only thing that still knows where
 * the reader came from is the URL. Without this the close button always guessed, which
 * meant closing an issue opened from the board dropped the reader into the backlog.
 *
 * A closed list of names rather than a `back=` path: the value ends up in a navigation,
 * and a whitelist cannot be talked into pointing off-site.
 */
export const LIST_VIEWS = ["backlog", "board", "tree", "my-work"] as const;
export type ListView = (typeof LIST_VIEWS)[number];

export const DEFAULT_LIST_VIEW: ListView = "backlog";

export function listViewFrom(value: unknown): ListView {
  return LIST_VIEWS.includes(value as ListView) ? (value as ListView) : DEFAULT_LIST_VIEW;
}

/** The query keys that decide *which* list a view shows, and so have to survive a close. */
interface ListQuery {
  project?: unknown;
  root?: unknown;
}

/** Where a close button goes: the list, still showing what it was showing. */
export function listHref(view: ListView, query: ListQuery): string {
  const search = new URLSearchParams();
  if (typeof query.project === "string" && query.project) search.set("project", query.project);
  // The tree can be focused on one branch. Returning to an unfocused tree is a different
  // screen from the one that was left.
  if (view === "tree" && typeof query.root === "string" && query.root) {
    search.set("root", query.root);
  }
  const suffix = search.toString();
  return `/${view}${suffix ? `?${suffix}` : ""}`;
}

/**
 * The link a row in `view` uses to open an issue.
 *
 * The view's own query is kept — it is what `listHref` reads back — and `from` is stamped
 * on so a refresh can still find its way home.
 */
export function issueHref(key: string, view: ListView, params?: URLSearchParams): string {
  const next = new URLSearchParams(params);
  next.set("from", view);
  return `/i/${key}?${next}`;
}

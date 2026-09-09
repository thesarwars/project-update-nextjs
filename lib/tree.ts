/**
 * Shared by the tree page and the tree component, so it lives outside both.
 *
 * Expansion is stored in a cookie rather than localStorage because the server renders
 * the rows: it has to know which branches are open, or the first client render disagrees
 * with the HTML and React throws a hydration error. A cookie is the only per-device store
 * the server can read.
 */
export const treeCookieName = (projectId: string) => `tree_${projectId}`;

/** Cookies ride on every request, so the stored list is deliberately short. */
export const EXPANDED_LIMIT = 120;

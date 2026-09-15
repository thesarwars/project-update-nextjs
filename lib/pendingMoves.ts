import type { Issue } from "./types";

/** A drop the server has not confirmed yet, and the version that will confirm it. */
export interface PendingMove {
  /** Paint until the board's data reaches this version of the issue. */
  version: number;
  statusId: string;
  boardRank: string;
}

/**
 * Paint drops that are still in flight over what the server last said.
 *
 * The rule is a version comparison and not a match against the state the card was
 * dropped from, because those two disagree exactly when it matters. A board issues a
 * refresh after every drop, so several answers can be in the air at once and they do not
 * have to arrive in order: one sent before the drop knows nothing about it, and under a
 * match rule it looks identical to somebody else having moved the card — the override is
 * dropped and the card snaps back to a column it has already left.
 *
 * A version says which it is. Older than the write behind the override: stale, keep
 * painting. At or past it: the board has caught up, or something newer happened, and
 * either way the server wins.
 */
export function applyPendingMoves(
  issues: Issue[],
  pending: Record<string, PendingMove>,
): Issue[] {
  return issues.map((issue) => {
    const move = pending[issue.id];
    return move && issue.version < move.version
      ? { ...issue, statusId: move.statusId, boardRank: move.boardRank }
      : issue;
  });
}

import type { StatusChange } from "./types";

/**
 * The client half of a cascading status change: saying what moved, and putting it back.
 *
 * Shared by the board and the detail pane so a drag and a dropdown report the same thing
 * in the same words — they are the same edit, made with different hands.
 */

/** What the API answers with when a status change carried other issues along. */
export interface MoveResult {
  moved?: StatusChange[];
}

/**
 * How a cascade reads, or null when there is nothing worth saying.
 *
 * One issue moving is the gesture the person just made, and narrating it back is noise.
 * Anything more than that changed rows they did not point at, and they should be told.
 */
export function cascadeMessage(moved: StatusChange[], statusName: string): string | null {
  const children = moved.length - 1;
  if (children < 1) return null;
  return `${moved[0].key} and ${children} ${children === 1 ? "child" : "children"} moved to ${statusName}`;
}

/**
 * Put every issue back where the cascade found it.
 *
 * Each of these is a backwards move, and a backwards move cascades nothing, so restoring
 * the parent cannot drag the children forward again on the way out.
 */
export async function restoreStatuses(moved: StatusChange[]): Promise<boolean> {
  const results = await Promise.all(
    moved.map((change) =>
      fetch(`/api/issues/${change.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId: change.statusId }),
      }).catch(() => null),
    ),
  );
  return results.every((res) => res?.ok === true);
}

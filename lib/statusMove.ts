import type { StatusChange, StatusMoveResult } from "./types";

/**
 * The client half of a status change: saying what it did, and offering the way out.
 *
 * Shared by the board and the detail pane so a drag and a dropdown report the same thing
 * in the same words — they are the same edit, made with different hands.
 */

export type MoveResult = Partial<StatusMoveResult>;

export interface MoveReport {
  message: string;
  action?: { label: string; kind: "undo" | "offer" };
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What a status change is worth telling someone, or null when it is not worth saying.
 *
 * One issue moving on its own is the gesture they just made, and narrating it back is
 * noise. Anything else changed rows they did not point at — or pointedly did not change
 * rows they might have expected to — and that they should hear about.
 */
export function moveReport(result: MoveResult, statusName: string): MoveReport | null {
  const moved = result.moved ?? [];
  const skipped = result.skipped ?? [];
  const offer = result.offer ?? [];
  const subject = moved[0];
  if (!subject) return null;

  if (offer.length) {
    return {
      message: `${subject.key} moved to ${statusName} · ${count(offer.length, "child is", "children are")} still where they were`,
      action: { label: "Move them too", kind: "offer" },
    };
  }

  const carried = moved.length - 1;
  if (!carried && !skipped.length) return null;

  const left = skipped.length ? ` · ${count(skipped.length, "left where it is", "left where they are")}` : "";
  const message = carried
    ? `${subject.key} and ${count(carried, "child", "children")} moved to ${statusName}${left}`
    : `${subject.key} moved to ${statusName}${left}`;
  return { message, action: result.moveId ? { label: "Undo", kind: "undo" } : undefined };
}

/** Put a recorded move back. Idempotent on the server, so a double click is harmless. */
export async function undoMove(moveId: string): Promise<boolean> {
  const res = await fetch(`/api/status-moves/${moveId}/revert`, { method: "POST" }).catch(
    () => null,
  );
  return res?.ok === true;
}

/**
 * Move the offered issues to where the subject went.
 *
 * Only reached when there was no record to replay, so this is the person saying "yes,
 * that work belongs to this one" — the app never decides it for them. Each of these is a
 * status change in its own right, so it carries its own subtree by the same rule.
 */
export async function moveAlso(issues: StatusChange[], statusId: string): Promise<boolean> {
  const results = await Promise.all(
    issues.map((issue) =>
      fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId }),
      }).catch(() => null),
    ),
  );
  return results.every((res) => res?.ok === true);
}

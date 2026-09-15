import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyPendingMoves, type PendingMove } from "../lib/pendingMoves";
import type { Issue } from "../lib/types";

/**
 * A board fires a refresh after every drop, so several answers can be in the air at once
 * and they do not have to come back in order. An override used to be keyed to the state
 * the card was dropped from, which cannot tell a stale answer from somebody else's edit:
 * one arriving late looked like a change, the override was dropped, and the card snapped
 * back to the column it had just left until the next refresh.
 *
 * Keying it to the version the write lands at tells the two apart.
 */
const issue = (over: Partial<Issue> & { id: string }): Issue =>
  ({
    projectId: "prj",
    number: 1,
    key: "GS-1",
    type: "task",
    parentId: null,
    statusId: "todo",
    title: over.id,
    description: "",
    assigneePersonId: null,
    reporterUserId: null,
    priority: 3,
    estimate: null,
    startDate: null,
    dueDate: null,
    rank: "m",
    boardRank: "m",
    path: "/",
    depth: 0,
    rootId: over.id,
    version: 4,
    createdAt: "",
    updatedAt: "",
    resolvedAt: null,
    archivedAt: null,
    ...over,
  }) as Issue;

const dropped: PendingMove = { version: 5, statusId: "doing", boardRank: "n" };

describe("applyPendingMoves", () => {
  it("paints a drop the board has not been told about yet", () => {
    const [card] = applyPendingMoves([issue({ id: "a" })], { a: dropped });
    assert.equal(card.statusId, "doing");
    assert.equal(card.boardRank, "n");
  });

  it("keeps painting through an answer that predates the drop", () => {
    // The refresh from an earlier action, still in flight when this one was dropped. It
    // reports the card where it used to be, at a version older than this write.
    const stale = issue({ id: "a", statusId: "todo", boardRank: "m", version: 4 });
    const [card] = applyPendingMoves([stale], { a: dropped });
    assert.equal(card.statusId, "doing", "a late answer must not pull the card back");
  });

  it("stands down once the board has caught up", () => {
    const confirmed = issue({ id: "a", statusId: "doing", boardRank: "n", version: 5 });
    const [card] = applyPendingMoves([confirmed], { a: dropped });
    assert.equal(card.version, 5);
    assert.equal(card.statusId, "doing");
  });

  it("lets a later change win, wherever it came from", () => {
    // Moved in the detail pane, or by someone else, after the drop.
    const elsewhere = issue({ id: "a", statusId: "done", version: 6 });
    const [card] = applyPendingMoves([elsewhere], { a: dropped });
    assert.equal(card.statusId, "done", "the newer write wins over a spent override");
  });

  it("leaves issues with nothing pending alone", () => {
    const untouched = issue({ id: "b", statusId: "todo" });
    const [card] = applyPendingMoves([untouched], { a: dropped });
    assert.equal(card.statusId, "todo");
    assert.equal(card, untouched, "returned as-is, not a copy");
  });
});

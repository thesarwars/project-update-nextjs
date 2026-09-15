import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";

/**
 * Board order, on the exact shape that exposed the bug: an epic, a story under it, a task
 * under that, and four subtasks under the task — all in To do. The first child of every
 * parent gets the same tree rank, so GS-1 to GS-4 tied, and the board sorted by that.
 */
const DIR = path.join(os.tmpdir(), `standup-board-test-${process.pid}`);
const DB_FILE = path.join(DIR, "standup.db");
process.env.STANDUP_DB_FILE = DB_FILE;
delete process.env.SMTP_HOST;
delete process.env.RESEND_API_KEY;

before(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
});
after(() => fs.rmSync(DIR, { recursive: true, force: true }));

const db = await import("../lib/db");
const { rankForDrop } = await import("../lib/rank");

type Issue = Awaited<ReturnType<typeof db.listIssues>>[number];

function made(result: Issue | string): Issue {
  assert.notEqual(typeof result, "string", `createIssue refused: ${String(result)}`);
  return result as Issue;
}

const project = db.createProject("Board Test", ["Someone"]);
const [todo, inProgress] = db.listStatuses(project.id);

const epic = made(db.createIssue({ projectId: project.id, type: "epic", title: "GSN Network TRD" }));
const story = made(db.createIssue({ projectId: project.id, type: "story", parentId: epic.id, title: "Onboarding TRD" }));
const task = made(db.createIssue({ projectId: project.id, type: "task", parentId: story.id, title: "Architecture" }));
const subtasks = ["Code", "SignUp", "Sign in", "Sign In"].map((title) =>
  made(db.createIssue({ projectId: project.id, type: "subtask", parentId: task.id, title })),
);
const all = [epic, story, task, ...subtasks];
const byTitle = (title: string) => all.find((i) => i.title === title)!;

/** What the board renders for a column, top to bottom. */
function column(statusId: string): string[] {
  return db
    .listIssues(project.id)
    .filter((i) => i.statusId === statusId)
    .sort((a, b) => (a.boardRank! < b.boardRank! ? -1 : a.boardRank! > b.boardRank! ? 1 : 0))
    .map((i) => i.title);
}

function treeShape() {
  return db
    .listIssues(project.id)
    .map((i) => `${i.title}|${i.parentId}|${i.rank}|${i.path}`)
    .sort();
}

describe("board order", () => {
  it("reproduces the precondition: tree ranks tie across parents", () => {
    const firstChildren = [epic, story, task, subtasks[0]].map((i) => db.getIssue(i.id)!.rank);
    assert.equal(new Set(firstChildren).size, 1, "the four first children share one tree rank");
  });

  it("gives every issue its own board position, in creation order", () => {
    const ranks = db.listIssues(project.id).sort((a, b) => a.number - b.number).map((i) => i.boardRank);
    assert.ok(ranks.every((r) => r !== null));
    assert.deepEqual([...ranks].sort(), ranks, "board order follows creation order");
    assert.equal(new Set(ranks).size, ranks.length, "no ties");
  });

  it("lands a card exactly where it is dropped, across parents", () => {
    const tree = treeShape();

    // The case worked by hand: GS-1 in front of GS-5 used to compute the tied key.
    db.moveIssueOnBoard(epic.id, { statusId: todo.id, beforeId: byTitle("SignUp").id });
    assert.deepEqual(column(todo.id), [
      "Onboarding TRD", "Architecture", "Code", "GSN Network TRD", "SignUp", "Sign in", "Sign In",
    ]);

    // To the top.
    db.moveIssueOnBoard(byTitle("Sign In").id, { statusId: todo.id, beforeId: story.id });
    assert.equal(column(todo.id)[0], "Sign In");

    // To the end.
    db.moveIssueOnBoard(story.id, { statusId: todo.id, beforeId: null });
    assert.equal(column(todo.id).at(-1), "Onboarding TRD");

    assert.deepEqual(treeShape(), tree, "board moves must not touch parent, tree rank or path");
  });

  it("moves between columns and lands in front of the chosen card", () => {
    db.moveIssueOnBoard(byTitle("Code").id, { statusId: inProgress.id, beforeId: null });
    db.moveIssueOnBoard(byTitle("Sign in").id, { statusId: inProgress.id, beforeId: byTitle("Code").id });
    assert.deepEqual(column(inProgress.id), ["Sign in", "Code"]);
    assert.ok(!column(todo.id).includes("Code"));
  });

  it("leaves the position alone on a status-only move", () => {
    const beforeRank = db.getIssue(task.id)!.boardRank;
    db.moveIssueOnBoard(task.id, { statusId: inProgress.id });
    assert.equal(db.getIssue(task.id)!.boardRank, beforeRank);
    assert.equal(db.getIssue(task.id)!.statusId, inProgress.id);
  });

  it("fills board positions on a hot reload, not only on a cold open", async () => {
    // What a running dev server did: the edit hot-reloaded, the column was added to the
    // already-open database, and every value stayed NULL.
    const raw = new DatabaseSync(DB_FILE);
    raw.exec("UPDATE issues SET board_rank = NULL");
    raw.close();
    // Keep the cached handle, as a hot reload does, and evaluate the module afresh.
    const reloaded: typeof db = await import(`../lib/db${"?hmr=1"}`);
    assert.ok(reloaded.listIssues(project.id).every((i) => i.boardRank !== null));
  });

  it("backfills issues that predate board_rank, oldest first", async () => {
    // Strip the column the way an older checkout would have left it, then reopen.
    const raw = new DatabaseSync(DB_FILE);
    raw.exec("UPDATE issues SET board_rank = NULL");
    raw.close();
    delete (globalThis as { __standupDb?: unknown }).__standupDb;
    // Not a literal, so tsc does not try to resolve the query string as a module path.
    const reopened: typeof db = await import(`../lib/db${"?reopen=1"}`);

    const ranked = reopened.listIssues(project.id).sort((a, b) => a.number - b.number);
    assert.ok(ranked.every((i) => i.boardRank !== null), "every issue backfilled");
    const ranks = ranked.map((i) => i.boardRank!);
    assert.deepEqual([...ranks].sort(), ranks, "backfill follows creation order");
  });
});

describe("rankForDrop", () => {
  it("never throws on tied neighbours — it lands in front of the chosen card instead", () => {
    const others = [{ id: "a", rank: "V00000" }, { id: "b", rank: "V00000" }];
    const key = rankForDrop(others, "b");
    assert.ok(key < "V00000");
  });

  it("appends when the target is gone from the column", () => {
    assert.ok(rankForDrop([{ id: "a", rank: "V00000" }], "missing") > "V00000");
  });
});

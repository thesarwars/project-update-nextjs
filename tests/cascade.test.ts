import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Moving a parent takes the work under it along — but only the work that has not got
 * there yet.
 *
 * The rule exists because of what it protects: `updateIssue` stamps `resolved_at` from
 * the new status, so a cascade that dragged a finished subtask backwards would erase the
 * day it was finished, silently, on a drag aimed at its parent.
 */
const DIR = path.join(os.tmpdir(), `standup-cascade-test-${process.pid}`);
process.env.STANDUP_DB_FILE = path.join(DIR, "standup.db");
delete process.env.SMTP_HOST;
delete process.env.RESEND_API_KEY;

before(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
});
after(() => fs.rmSync(DIR, { recursive: true, force: true }));

const db = await import("../lib/db");
const { compareStatus, isBehind } = await import("../lib/types");

type Issue = Awaited<ReturnType<typeof db.listIssues>>[number];

function made(result: Issue | string): Issue {
  assert.notEqual(typeof result, "string", `createIssue refused: ${String(result)}`);
  return result as Issue;
}

const project = db.createProject("Cascade Test", ["Someone"]);
const statuses = db.listStatuses(project.id);
const byName = (name: string) => statuses.find((s) => s.name === name)!;
const todo = byName("To do");
const inProgress = byName("In progress");
const inReview = byName("In review");
const done = byName("Done");
const wontDo = byName("Won't do");

/** A fresh epic > story > task > four subtasks, all in To do. */
function tree(label: string) {
  const epic = made(db.createIssue({ projectId: project.id, type: "epic", title: `${label} epic` }));
  const story = made(
    db.createIssue({ projectId: project.id, type: "story", parentId: epic.id, title: `${label} story` }),
  );
  const task = made(
    db.createIssue({ projectId: project.id, type: "task", parentId: story.id, title: `${label} task` }),
  );
  const subs = ["a", "b", "c", "d"].map((s) =>
    made(db.createIssue({ projectId: project.id, type: "subtask", parentId: task.id, title: `${label} ${s}` })),
  );
  return { epic, story, task, subs };
}

const statusOf = (id: string) => db.getIssue(id)!.statusId;

function cascade(id: string, statusId: string) {
  const result = db.updateIssueCascading(id, { statusId });
  assert.notEqual(typeof result, "string", `refused: ${String(result)}`);
  return result as { issue: Issue; moved: { id: string; key: string; statusId: string }[] };
}

describe("status order", () => {
  it("ranks by category first, then by the project's own order", () => {
    assert.ok(compareStatus(todo, inProgress) < 0);
    assert.ok(compareStatus(inProgress, done) < 0);
    // Both are in_progress: the project's own order decides.
    assert.ok(compareStatus(inProgress, inReview) < 0);
    assert.ok(isBehind(todo, done));
    assert.ok(!isBehind(done, todo));
    // Nothing is behind itself, so re-picking the status it already has moves nothing.
    assert.ok(!isBehind(inProgress, inProgress));
  });
});

describe("updateIssueCascading", () => {
  it("carries the whole subtree forward, at every level", () => {
    const { epic, story, task, subs } = tree("whole");
    const { moved } = cascade(epic.id, inProgress.id);

    assert.equal(moved.length, 7, "the epic and its six descendants");
    for (const issue of [epic, story, task, ...subs]) {
      assert.equal(statusOf(issue.id), inProgress.id, issue.title);
    }
    // Every entry records where it was, not where it went — that is what undo replays.
    assert.ok(moved.every((m) => m.statusId === todo.id));
    assert.equal(moved[0].id, epic.id, "the issue that was moved comes first");
  });

  it("leaves anything already at or past the new status alone", () => {
    const { epic, task, subs } = tree("ahead");
    db.updateIssue(subs[0].id, { statusId: done.id });
    db.updateIssue(subs[1].id, { statusId: wontDo.id });
    db.updateIssue(subs[2].id, { statusId: inReview.id });
    const finishedAt = db.getIssue(subs[0].id)!.resolvedAt;
    assert.ok(finishedAt, "a done subtask has a resolved date");

    const { moved } = cascade(task.id, inReview.id);

    assert.equal(statusOf(subs[0].id), done.id, "done stays done");
    assert.equal(statusOf(subs[1].id), wontDo.id, "won't do stays won't do");
    assert.equal(statusOf(subs[2].id), inReview.id, "already there, untouched");
    assert.equal(statusOf(subs[3].id), inReview.id, "the one behind moved");
    // The whole point: a finished subtask keeps the day it was finished.
    assert.equal(db.getIssue(subs[0].id)!.resolvedAt, finishedAt);
    assert.deepEqual(
      moved.map((m) => m.id).sort(),
      [task.id, subs[3].id].sort(),
      "only the issues that actually moved are reported",
    );
    // An ancestor is never dragged along by its child.
    assert.equal(statusOf(epic.id), todo.id);
  });

  it("moves nothing when the parent goes backwards", () => {
    const { epic, story, subs } = tree("backwards");
    cascade(epic.id, inReview.id);

    const { moved } = cascade(epic.id, todo.id);

    assert.equal(moved.length, 1, "only the epic itself");
    assert.equal(statusOf(epic.id), todo.id);
    assert.equal(statusOf(story.id), inReview.id, "the work under it stays where it got to");
    assert.equal(statusOf(subs[0].id), inReview.id);
  });

  it("restores the tree when the reported moves are replayed", () => {
    const { epic, story, task, subs } = tree("undo");
    db.updateIssue(subs[0].id, { statusId: done.id });
    const before = [epic, story, task, ...subs].map((i) => [i.id, statusOf(i.id)] as const);

    const { moved } = cascade(epic.id, inProgress.id);
    // What the Undo button does: put each one back where it was found.
    for (const change of moved) db.updateIssueCascading(change.id, { statusId: change.statusId });

    for (const [id, status] of before) assert.equal(statusOf(id), status, id);
  });

  it("closes the subtree when the parent is closed, and stamps the date", () => {
    const { epic, subs } = tree("closing");
    db.updateIssue(subs[0].id, { statusId: wontDo.id });

    cascade(epic.id, done.id);

    assert.equal(statusOf(epic.id), done.id);
    assert.equal(statusOf(subs[1].id), done.id);
    assert.ok(db.getIssue(subs[1].id)!.resolvedAt, "finishing stamps the resolved date");
    assert.equal(statusOf(subs[0].id), wontDo.id, "already closed, left as it was");
  });

  it("does not touch archived work", () => {
    const { task, subs } = tree("archived");
    db.archiveIssue(subs[0].id, true);

    const { moved } = cascade(task.id, inProgress.id);

    assert.equal(statusOf(subs[0].id), todo.id, "an archived subtask is not in play");
    assert.ok(!moved.some((m) => m.id === subs[0].id));
    assert.equal(statusOf(subs[1].id), inProgress.id);
  });

  it("reports nothing to say when a leaf moves on its own", () => {
    const { subs } = tree("leaf");
    const { moved } = cascade(subs[0].id, inProgress.id);
    assert.equal(moved.length, 1, "just the issue the person moved");
  });
});

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

type Change = { id: string; key: string; statusId: string };
/** A moved issue carries both ends, so a board can paint it without a server round trip. */
type Move = { id: string; key: string; from: string; to: string };
type Result = {
  issue: Issue;
  moveId: string | null;
  statusId: string;
  moved: Move[];
  skipped: Change[];
  offer: Change[];
};

function cascade(id: string, statusId: string): Result {
  const result = db.updateIssueCascading(id, { statusId });
  assert.notEqual(typeof result, "string", `refused: ${String(result)}`);
  return result as Result;
}

const ids = (changes: { id: string }[]) => changes.map((c) => c.id).sort();

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
    // Every entry carries both ends: where it was, which is what undo replays, and where
    // it went, which is what the board paints straight away.
    assert.ok(moved.every((m) => m.from === todo.id && m.to === inProgress.id));
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

  // This used to assert that a backwards move touched nothing. It now puts back what it
  // carried — see the block below for why that is a replay of a record rather than a
  // second cascade in the other direction.
  it("puts back what it carried when the parent goes backwards", () => {
    const { epic, story, subs } = tree("backwards");
    cascade(epic.id, inReview.id);

    const { moved } = cascade(epic.id, todo.id);

    assert.equal(statusOf(epic.id), todo.id);
    assert.equal(statusOf(story.id), todo.id, "carried forward, so carried back");
    assert.equal(statusOf(subs[0].id), todo.id);
    assert.equal(moved.length, 7, "the epic and the six it had carried");
  });

  it("restores the tree when the reported moves are replayed", () => {
    const { epic, story, task, subs } = tree("undo");
    db.updateIssue(subs[0].id, { statusId: done.id });
    const before = [epic, story, task, ...subs].map((i) => [i.id, statusOf(i.id)] as const);

    const { moved } = cascade(epic.id, inProgress.id);
    // Replaying the record by hand, which is what the reported ends are for.
    for (const change of moved) db.updateIssueCascading(change.id, { statusId: change.from });

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

/**
 * Putting a move back.
 *
 * Dragging a parent back cannot mean "move everything sitting in the status I am
 * leaving": an epic over five stories, two of which someone started on their own, would
 * drag those two back as well. Each move is recorded, so going back replays exactly what
 * that move picked up — the two independent ones were never in the record.
 */
describe("putting a status move back", () => {
  /** An epic with five stories, in rank order. */
  function fan(label: string) {
    const epic = made(db.createIssue({ projectId: project.id, type: "epic", title: `${label} epic` }));
    const stories = [1, 2, 3, 4, 5].map((n) =>
      made(
        db.createIssue({
          projectId: project.id,
          type: "story",
          parentId: epic.id,
          title: `${label} story ${n}`,
        }),
      ),
    );
    return { epic, stories };
  }

  it("leaves work that was already in progress on its own", () => {
    const { epic, stories } = fan("fan");
    // Two of the five were started by someone, before the epic moved anywhere.
    db.updateIssue(stories[3].id, { statusId: inProgress.id });
    db.updateIssue(stories[4].id, { statusId: inProgress.id });

    const forward = cascade(epic.id, inProgress.id);
    assert.deepEqual(
      ids(forward.moved),
      ids([{ id: epic.id }, ...stories.slice(0, 3).map((s) => ({ id: s.id }))]),
      "only the three that were behind came along",
    );

    const back = cascade(epic.id, todo.id);

    assert.equal(statusOf(epic.id), todo.id);
    for (const story of stories.slice(0, 3)) {
      assert.equal(statusOf(story.id), todo.id, "carried forward, so carried back");
    }
    for (const story of stories.slice(3)) {
      assert.equal(statusOf(story.id), inProgress.id, "never in the record, never touched");
    }
    assert.equal(back.moved.length, 4, "the epic and the three it had carried");
    assert.equal(back.offer.length, 0, "there was a record, so nothing to offer");
  });

  it("leaves a child that someone has moved on since, and says which", () => {
    const { epic, stories } = fan("moved-on");
    cascade(epic.id, inProgress.id);
    // Someone picks one up and pushes it further while the epic sits there.
    db.updateIssue(stories[0].id, { statusId: inReview.id });

    const back = cascade(epic.id, todo.id);

    assert.equal(statusOf(stories[0].id), inReview.id, "their work wins over the rewind");
    assert.deepEqual(ids(back.skipped), [stories[0].id]);
    assert.equal(statusOf(stories[1].id), todo.id);
    assert.equal(back.moved.length, 5, "the epic and the four still where it left them");
  });

  it("walks back through more than one step", () => {
    const { epic, stories } = fan("chain");
    cascade(epic.id, inProgress.id);
    cascade(epic.id, inReview.id);
    for (const story of stories) assert.equal(statusOf(story.id), inReview.id);

    cascade(epic.id, todo.id);

    assert.equal(statusOf(epic.id), todo.id);
    for (const story of stories) {
      assert.equal(statusOf(story.id), todo.id, "both records were replayed, in order");
    }
  });

  it("stops at the step it was asked for", () => {
    const { epic, stories } = fan("one-step");
    cascade(epic.id, inProgress.id);
    cascade(epic.id, inReview.id);

    cascade(epic.id, inProgress.id);

    assert.equal(statusOf(epic.id), inProgress.id);
    for (const story of stories) {
      assert.equal(statusOf(story.id), inProgress.id, "back one step, not two");
    }
  });

  it("offers the rest when there is no record to replay", () => {
    const { epic, stories } = fan("no-record");
    // Moved forward without a record, as anything done before this existed would be.
    db.updateIssue(epic.id, { statusId: inProgress.id });
    for (const story of stories) db.updateIssue(story.id, { statusId: inProgress.id });

    const back = cascade(epic.id, todo.id);

    assert.equal(statusOf(epic.id), todo.id);
    assert.equal(back.moved.length, 1, "the epic alone — nothing was assumed");
    assert.deepEqual(ids(back.offer), ids(stories.map((s) => ({ id: s.id }))));
    for (const story of stories) assert.equal(statusOf(story.id), inProgress.id);
  });

  it("offers rather than replaying when someone else moved the parent", () => {
    const { epic, stories } = fan("hijacked");
    cascade(epic.id, inProgress.id);
    // Somebody moves the epic on, so the record no longer describes where it is.
    db.updateIssue(epic.id, { statusId: inReview.id });

    const back = cascade(epic.id, inProgress.id);

    assert.equal(back.moved.length, 1);
    assert.equal(back.offer.length, 0, "nothing sits in In review under it");
    for (const story of stories) {
      assert.equal(statusOf(story.id), inProgress.id, "the broken chain replays nothing");
    }
  });

  it("is what Undo replays, once", () => {
    const { epic, stories } = fan("undo-once");
    const forward = cascade(epic.id, inProgress.id);
    assert.ok(forward.moveId);

    const first = db.revertStatusMove(forward.moveId!) as { moved: Move[]; skipped: Change[] };
    assert.equal(first.moved.length, 6, "the epic and its five stories");
    assert.equal(statusOf(epic.id), todo.id, "Undo puts the subject back too");
    for (const story of stories) assert.equal(statusOf(story.id), todo.id);

    // Clicking it twice, or dragging the parent back after clicking it, changes nothing.
    const second = db.revertStatusMove(forward.moveId!) as { moved: Move[] };
    assert.equal(second.moved.length, 0);
  });

  it("restores the resolved date a move overwrote", () => {
    const { epic, stories } = fan("resolved");
    db.updateIssue(stories[0].id, { statusId: done.id });
    const finishedAt = db.getIssue(stories[0].id)!.resolvedAt;

    // Closing the epic as Won't do carries the Done story, because Won't do sorts after
    // Done in this project's own order.
    cascade(epic.id, wontDo.id);
    assert.equal(statusOf(stories[0].id), wontDo.id);

    cascade(epic.id, todo.id);

    assert.equal(statusOf(stories[0].id), done.id);
    assert.equal(db.getIssue(stories[0].id)!.resolvedAt, finishedAt, "the original date, not a new one");
  });

  it("does not carry anything forward on the way back", () => {
    const { epic, stories } = fan("no-forward");
    const task = made(
      db.createIssue({ projectId: project.id, type: "task", parentId: stories[0].id, title: "under" }),
    );
    cascade(epic.id, inProgress.id);
    assert.equal(statusOf(task.id), inProgress.id);

    cascade(epic.id, todo.id);

    assert.equal(statusOf(task.id), todo.id, "put back with its story");
    assert.equal(statusOf(stories[1].id), todo.id);
  });
});

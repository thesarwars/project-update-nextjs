import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";

/**
 * A dev server keeps its database handle on globalThis across a hot reload, so schema
 * written since that handle was opened has to reach it through `open()` rather than
 * through a restart.
 *
 * Columns already did: `addMissingColumns` runs whenever a re-evaluated module finds a
 * cached handle. Tables did not, and nothing noticed until `status_moves` shipped and
 * every drop on the board answered 500 with "no such table" until the server was
 * restarted. A cold start creates it, which is exactly why testing against a fresh server
 * could not catch it.
 *
 * Re-importing the module with a different query string gives it fresh module scope while
 * globalThis keeps the open handle — the same pair a hot reload produces.
 */
const DIR = path.join(os.tmpdir(), `standup-hot-reload-test-${process.pid}`);
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

/** Tables and indexes the running database actually has. */
function objects(): Set<string> {
  const handle = new DatabaseSync(DB_FILE, { readOnly: true });
  const rows = handle.prepare("SELECT name FROM sqlite_master").all() as unknown as {
    name: string;
  }[];
  handle.close();
  return new Set(rows.map((r) => r.name));
}

describe("schema on a hot-reloaded handle", () => {
  it("puts back a table that went missing under an open connection", async () => {
    // Opens the handle and caches it on globalThis, as the first request of a dev server
    // does.
    const project = db.createProject("Hot Reload", ["Someone"]);
    assert.ok(objects().has("status_moves"));

    // Stand in for "this table was added to SCHEMA after the server started".
    const surgeon = new DatabaseSync(DB_FILE);
    surgeon.exec("DROP TABLE status_moves");
    surgeon.close();
    assert.ok(!objects().has("status_moves"), "the table is really gone");

    // The hot reload: fresh module scope, same handle underneath.
    const reloaded = await import(`../lib/db?hot=${Date.now()}`);
    const statuses = reloaded.listStatuses(project.id);
    const issue = reloaded.createIssue({
      projectId: project.id,
      type: "task",
      title: "After the reload",
    });
    assert.notEqual(typeof issue, "string", `createIssue refused: ${String(issue)}`);

    // The move that used to answer 500. It writes to status_moves, so it can only work
    // if the reload re-applied the schema.
    const moved = reloaded.updateIssueCascading((issue as { id: string }).id, {
      statusId: statuses.find((s: { name: string }) => s.name === "In progress")!.id,
    });
    assert.notEqual(typeof moved, "string", `the move was refused: ${String(moved)}`);
    assert.ok(objects().has("status_moves"), "the table came back with the reload");
    assert.ok(objects().has("status_moves_subject"), "and so did its index");
  });
});

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * The database file going missing under a live connection.
 *
 * SQLite will not write through a connection whose file has been deleted or renamed —
 * SQLITE_READONLY_DBMOVED, which it reports as "attempt to write a readonly database".
 * That message reads like a permissions problem and is not one, and it cost an
 * afternoon: a dev server holding a temporary database that a cleanup step removed
 * answered every page with an ALTER TABLE stack trace.
 */
const DIR = path.join(os.tmpdir(), `standup-open-test-${process.pid}`);
const DB_FILE = path.join(DIR, "standup.db");
process.env.STANDUP_DB_FILE = DB_FILE;
delete process.env.SMTP_HOST;
delete process.env.RESEND_API_KEY;

const db = await import("../lib/db");

before(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
});

after(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
});

describe("a database that vanishes underneath us", () => {
  it("reopens instead of reporting the file as read-only", () => {
    db.createProject("Before", ["Someone"]);
    assert.ok(db.listProjects().some((p) => p.name === "Before"));

    // What the cleanup step did.
    fs.rmSync(DB_FILE, { force: true });

    // Without the guard this throws "attempt to write a readonly database".
    db.createProject("After", ["Someone"]);

    assert.equal(fs.existsSync(DB_FILE), true, "the file should be back");
    assert.ok(
      db.listProjects().some((p) => p.name === "After"),
      "the write should have landed in the reopened database",
    );
    // The old contents are gone with the old file, which is expected and is why this is
    // a development affordance rather than anything to rely on.
    assert.equal(
      db.listProjects().some((p) => p.name === "Before"),
      false,
    );
  });

  it("still reads after the file is removed, so no page 500s on the way", () => {
    // Reads keep working against the unlinked inode; only writes fail. Asserted so the
    // guard is never "fixed" into throwing on reads.
    fs.rmSync(DB_FILE, { force: true });
    assert.doesNotThrow(() => db.countUsers());
  });
});

import { randomUUID } from "node:crypto";
import { rankBetween } from "./rank";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_LABELS,
  DEFAULT_STATUSES,
  ISSUE_TYPES,
  ISSUE_TYPE_META,
  PARENT_RULES,
  MAX_DEPTH,
  ROOT_TYPES,
  type Invite,
  type Issue,
  type IssueType,
  type Role,
  type Status,
  type StatusCategory,
  type Session,
  type User,
  type UserStatus,
  DEFAULT_TITLE_TEMPLATE,
  SECTION_KEYS,
  type Entry,
  type EntryText,
  type Person,
  type Project,
  type SectionKey,
} from "./types";

const DB_FILE = process.env.STANDUP_DB_FILE ?? path.join(process.cwd(), "data", "standup.db");

export const databasePath = DB_FILE;

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

const labelColumn = (key: SectionKey) => `${key}_label`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  title_template TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS people (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS people_by_project ON people(project_id, sort_order);

CREATE TABLE IF NOT EXISTS entries (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  person_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, date, person_id)
);
CREATE INDEX IF NOT EXISTS entries_by_day ON entries(project_id, date);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  -- NULL means invited but not yet claimed: the row is real and assignable, but
  -- nobody can sign in as it.
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'member',
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);
-- Expression index, so "one account per address" holds regardless of typed case.
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  -- The SHA-256 of the cookie token, never the token: a leaked database, or a leaked
  -- backup, must not hand over live sessions.
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS invites (
  id               TEXT PRIMARY KEY,
  -- Like sessions, only the hash is stored. The raw token is shown once, to the admin
  -- who created it, and never again.
  token_hash       TEXT NOT NULL UNIQUE,
  email            TEXT NOT NULL,
  name             TEXT,
  role             TEXT NOT NULL DEFAULT 'member',
  -- The roster row being claimed. Because entries are keyed by person_id, claiming this
  -- hands the new account every standup entry that row has ever written.
  person_id        TEXT REFERENCES people(id) ON DELETE CASCADE,
  created_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL,
  expires_at       TEXT NOT NULL,
  accepted_at      TEXT,
  accepted_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS invites_by_person ON invites(person_id);

-- Reference data, seeded from constants in lib/types.ts. It lives in tables rather than
-- in code so the rules can be read by a trigger, and changed without a deploy.
CREATE TABLE IF NOT EXISTS issue_types (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  level       INTEGER NOT NULL,
  can_be_root INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS issue_parent_rules (
  parent_type TEXT NOT NULL REFERENCES issue_types(key) ON DELETE CASCADE,
  child_type  TEXT NOT NULL REFERENCES issue_types(key) ON DELETE CASCADE,
  PRIMARY KEY (parent_type, child_type)
);

CREATE TABLE IF NOT EXISTS statuses (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('todo','in_progress','done')),
  -- The single source of truth for "is this finished". No query compares a status name.
  is_done    INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  is_default INTEGER NOT NULL DEFAULT 0,
  color      TEXT NOT NULL DEFAULT '#666b74',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS statuses_name ON statuses(project_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS statuses_default ON statuses(project_id) WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS issues (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number       INTEGER NOT NULL,
  type         TEXT NOT NULL REFERENCES issue_types(key),
  -- CASCADE, not RESTRICT: RESTRICT on a self-referencing key makes deleting the whole
  -- project fail, because parents and children are removed in an unspecified order.
  -- The UI archives instead of deleting, so this rarely fires.
  parent_id    TEXT REFERENCES issues(id) ON DELETE CASCADE,
  status_id    TEXT NOT NULL REFERENCES statuses(id),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  -- A roster row, so someone who has not signed up yet is still assignable.
  assignee_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  reporter_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  priority     INTEGER NOT NULL DEFAULT 3,
  estimate     REAL,
  rank         TEXT NOT NULL,
  -- Derived from parent_id by one UPDATE over a path range. root_id is what turns the
  -- whole-board epic rollup into a GROUP BY instead of a correlated prefix match.
  path         TEXT NOT NULL DEFAULT '/',
  depth        INTEGER NOT NULL DEFAULT 0 CHECK (depth BETWEEN 0 AND 6),
  root_id      TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  resolved_at  TEXT,
  archived_at  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS issues_key ON issues(project_id, number);
CREATE INDEX IF NOT EXISTS issues_parent   ON issues(parent_id);
CREATE INDEX IF NOT EXISTS issues_root     ON issues(project_id, root_id);
CREATE INDEX IF NOT EXISTS issues_path     ON issues(project_id, path);
CREATE INDEX IF NOT EXISTS issues_rank     ON issues(project_id, rank, id);
CREATE INDEX IF NOT EXISTS issues_status   ON issues(project_id, status_id);
CREATE INDEX IF NOT EXISTS issues_backlog  ON issues(project_id, archived_at, rank);
CREATE INDEX IF NOT EXISTS issues_assignee ON issues(assignee_person_id, status_id)
  WHERE archived_at IS NULL;

-- The database is the backstop for the hierarchy rules. Because the trigger reads the
-- rule table rather than hard-coding the matrix, changing a rule row changes enforcement.
CREATE TRIGGER IF NOT EXISTS issues_parent_rule_insert
BEFORE INSERT ON issues WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'illegal_parent_type')
  WHERE NOT EXISTS (
    SELECT 1 FROM issues p
      JOIN issue_parent_rules r ON r.parent_type = p.type AND r.child_type = NEW.type
     WHERE p.id = NEW.parent_id AND p.project_id = NEW.project_id
  );
END;

-- The UPDATE OF list includes type deliberately: retyping a story into a subtask under an
-- epic is the same violation reached through a different door.
CREATE TRIGGER IF NOT EXISTS issues_parent_rule_update
BEFORE UPDATE OF parent_id, type ON issues WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'illegal_parent_type')
  WHERE NOT EXISTS (
    SELECT 1 FROM issues p
      JOIN issue_parent_rules r ON r.parent_type = p.type AND r.child_type = NEW.type
     WHERE p.id = NEW.parent_id AND p.project_id = NEW.project_id
  );
END;

CREATE TRIGGER IF NOT EXISTS issues_root_type_insert
BEFORE INSERT ON issues WHEN NEW.parent_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'illegal_root_type')
  WHERE NOT EXISTS (
    SELECT 1 FROM issue_types t WHERE t.key = NEW.type AND t.can_be_root = 1
  );
END;

CREATE TRIGGER IF NOT EXISTS issues_root_type_update
BEFORE UPDATE OF parent_id, type ON issues WHEN NEW.parent_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'illegal_root_type')
  WHERE NOT EXISTS (
    SELECT 1 FROM issue_types t WHERE t.key = NEW.type AND t.can_be_root = 1
  );
END;
`;

/**
 * The per-section columns are added here rather than in SCHEMA, so that adding a
 * section to SECTION_KEYS also upgrades a database that predates it. Existing rows
 * keep their data and get an empty string for the new section.
 */
/**
 * Columns added after their table already existed. Additive only — never a rename or a
 * drop — so a `version-1` checkout keeps working against a migrated database.
 */
const EXTRA_COLUMNS: { table: string; column: string; ddl: string }[] = [
  // Links a per-project roster row to an account. Nullable: a roster row without an
  // account still renders in the standup and still owns its history.
  { table: "people", column: "user_id", ddl: "TEXT REFERENCES users(id) ON DELETE SET NULL" },
  // Rendered as the prefix in GS-142. Nullable so the column can be added to an existing
  // table; the migration fills it in.
  { table: "projects", column: "key", ddl: "TEXT" },
  { table: "projects", column: "next_issue_number", ddl: "INTEGER NOT NULL DEFAULT 1" },
];

function addMissingColumns(db: DatabaseSync): void {
  const columnsOf = (table: string) =>
    new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[]).map(
        (r) => r.name,
      ),
    );

  const entryColumns = columnsOf("entries");
  const projectColumns = columnsOf("projects");

  for (const key of SECTION_KEYS) {
    if (!entryColumns.has(key)) {
      db.exec(`ALTER TABLE entries ADD COLUMN ${key} TEXT NOT NULL DEFAULT ''`);
    }
    const column = labelColumn(key);
    if (!projectColumns.has(column)) {
      db.exec(
        `ALTER TABLE projects ADD COLUMN ${column} TEXT NOT NULL DEFAULT '${DEFAULT_LABELS[key]}'`,
      );
    }
  }

  for (const { table, column, ddl } of EXTRA_COLUMNS) {
    // SQLite allows ADD COLUMN with a REFERENCES clause only when it defaults to NULL,
    // which every entry here does.
    if (!columnsOf(table).has(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Write transactions
 * ------------------------------------------------------------------ */

/** SQLITE_BUSY / SQLITE_LOCKED. `errcode` is numeric and stable; the message is not. */
function isBusy(err: unknown): boolean {
  const code = (err as { errcode?: number })?.errcode;
  return code === 5 || code === 6;
}

const BUSY_RETRIES = 4;
const sleeper = new Int32Array(new SharedArrayBuffer(4));

/** Synchronous sleep. There is no await available inside a transaction, by design. */
function backoff(attempt: number): void {
  Atomics.wait(sleeper, 0, 0, 10 * 2 ** attempt + Math.floor(Math.random() * 10));
}

/** Raised when a write could not get the lock. Routes should answer 503, not 500. */
export class DatabaseBusyError extends Error {
  constructor(cause?: unknown) {
    super("The database is busy. Try again.");
    this.name = "DatabaseBusyError";
    this.cause = cause;
  }
}

let txDepth = 0;

/**
 * Run a write transaction.
 *
 * `fn` is SYNCHRONOUS on purpose. `node:sqlite` blocks the event loop, so an `await`
 * between BEGIN and COMMIT would let another request interleave its statements on this
 * same connection. A synchronous callback makes that mistake a compile error rather
 * than an intermittent one.
 *
 * BEGIN IMMEDIATE, not BEGIN. A deferred transaction takes a read lock and upgrades on
 * first write; if anything wrote in between, SQLite returns SQLITE_BUSY *immediately*
 * and never consults busy_timeout. IMMEDIATE takes the write lock up front, so the
 * timeout applies and the retry below is a backstop rather than the only defence.
 *
 * Nested calls use SAVEPOINT, since SQLite has no nested BEGIN.
 */
export function withWrite<T>(fn: (db: DatabaseSync) => T): T {
  const db = open();

  if (txDepth > 0) {
    const name = `sp_${txDepth}`;
    db.exec(`SAVEPOINT ${name}`);
    txDepth += 1;
    try {
      const result = fn(db);
      db.exec(`RELEASE ${name}`);
      return result;
    } catch (err) {
      db.exec(`ROLLBACK TO ${name}`);
      db.exec(`RELEASE ${name}`);
      throw err;
    } finally {
      txDepth -= 1;
    }
  }

  for (let attempt = 0; ; attempt += 1) {
    try {
      db.exec("BEGIN IMMEDIATE");
    } catch (err) {
      if (isBusy(err) && attempt < BUSY_RETRIES) {
        backoff(attempt);
        continue;
      }
      throw isBusy(err) ? new DatabaseBusyError(err) : err;
    }

    txDepth = 1;
    try {
      const result = fn(db);
      db.exec("COMMIT");
      return result;
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* SQLite already rolled the transaction back */
      }
      if (isBusy(err) && attempt < BUSY_RETRIES) {
        backoff(attempt);
        continue;
      }
      throw isBusy(err) ? new DatabaseBusyError(err) : err;
    } finally {
      txDepth = 0;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Schema versioning
 * ------------------------------------------------------------------ */

interface Migration {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
}

/**
 * Ordered, run-once schema steps.
 *
 * `addMissingColumns()` stays the mechanism for adding columns — it is idempotent by
 * construction and needs no bookkeeping. This ladder exists for the things it cannot
 * express: backfills, renames, table rebuilds. Each `up` should still be written
 * defensively, because a fresh database gets the full SCHEMA first and then runs the
 * ladder over it.
 *
 * Version lives in `PRAGMA user_version` rather than a settings row: it is atomic with
 * the transaction that performs the step, and the app's own settings UI cannot clobber it.
 */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "seed issue types, rules and per-project tracker defaults",
    up(db) {
      seedIssueReferenceData(db);
      db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS projects_key ON projects(key) WHERE key IS NOT NULL",
      );
      // Per-project defaults are handled by the backfill below rather than here: this
      // migration runs before the first project exists on a fresh database, and the
      // backfill has to cover projects created later anyway.
    },
  },
];

/**
 * Reference data mirrored from the constants in lib/types.ts.
 *
 * Written on every open rather than once, because the constants are the source of truth:
 * editing PARENT_RULES should change what the triggers enforce on the next start, not
 * leave the database describing a hierarchy the code no longer believes in.
 */
function seedIssueReferenceData(db: DatabaseSync): void {
  const upsertType = db.prepare(
    `INSERT INTO issue_types (key, label, level, can_be_root, sort_order)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       label = excluded.label, level = excluded.level,
       can_be_root = excluded.can_be_root, sort_order = excluded.sort_order`,
  );
  for (const type of ISSUE_TYPES) {
    const meta = ISSUE_TYPE_META[type];
    upsertType.run(type, meta.label, meta.level, ROOT_TYPES.includes(type) ? 1 : 0, meta.sortOrder);
  }

  db.prepare("DELETE FROM issue_parent_rules").run();
  const insertRule = db.prepare(
    "INSERT OR IGNORE INTO issue_parent_rules (parent_type, child_type) VALUES (?, ?)",
  );
  for (const child of ISSUE_TYPES) {
    for (const parent of PARENT_RULES[child]) insertRule.run(parent, child);
  }
}

/** `Go Style` -> `GS`, `Go Style Network` -> `GSN`, uniquified against existing keys. */
function deriveProjectKey(db: DatabaseSync, name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join("").toUpperCase();
  const base = (initials || name.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "P").slice(0, 4);

  const taken = db.prepare("SELECT 1 FROM projects WHERE key = ?");
  if (taken.get(base) === undefined) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}${n}`;
    if (taken.get(candidate) === undefined) return candidate;
  }
  return `${base}${Math.floor(SPACE_SALT)}`;
}

/** Cheap deterministic fallback, only reached if 98 keys already collide. */
const SPACE_SALT = 1000;

/**
 * Any project missing a key or a status set gets one.
 *
 * Runs on open and is idempotent, which covers all three cases at once: the projects that
 * predate the tracker, the sample project seeded moments earlier, and anything created
 * while the server was not running.
 */
function backfillProjectTrackerDefaults(db: DatabaseSync): void {
  const pending = db
    .prepare(
      `SELECT id, name FROM projects
        WHERE key IS NULL
           OR NOT EXISTS (SELECT 1 FROM statuses s WHERE s.project_id = projects.id)`,
    )
    .all() as unknown as { id: string; name: string }[];
  for (const project of pending) ensureProjectTrackerDefaults(db, project.id, project.name);
}

/** A project needs a key and a status set before it can hold an issue. Idempotent. */
export function ensureProjectTrackerDefaults(
  db: DatabaseSync,
  projectId: string,
  name: string,
): void {
  const row = db.prepare("SELECT key FROM projects WHERE id = ?").get(projectId) as
    | { key: string | null }
    | undefined;
  if (row && !row.key) {
    db.prepare("UPDATE projects SET key = ? WHERE id = ?").run(
      deriveProjectKey(db, name),
      projectId,
    );
  }

  const { n } = db
    .prepare("SELECT COUNT(*) AS n FROM statuses WHERE project_id = ?")
    .get(projectId) as { n: number };
  if (n > 0) return;

  const insert = db.prepare(
    `INSERT INTO statuses (id, project_id, name, category, is_done, is_default, color, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  DEFAULT_STATUSES.forEach((status, i) => {
    insert.run(
      newId("sts"),
      projectId,
      status.name,
      status.category,
      status.isDone ? 1 : 0,
      status.isDefault ? 1 : 0,
      status.color,
      i,
    );
  });
}

function runMigrations(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as Record<string, number>;
  const current = Number(Object.values(row)[0] ?? 0);

  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );

  for (const migration of pending) {
    db.exec("BEGIN IMMEDIATE");
    try {
      migration.up(db);
      // PRAGMA cannot be parameterised. The integer comes from our own array, and
      // Math.trunc makes that guarantee explicit rather than implied.
      db.exec(`PRAGMA user_version = ${Math.trunc(migration.version)}`);
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* already rolled back */
      }
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed; database left at ` +
          `user_version ${current}. Restore from data/backups and investigate.`,
        { cause: err },
      );
    }
  }
}

/** DELETE locally (one copyable file), WAL when deployed (concurrent readers). */
const JOURNAL_MODE = (process.env.STANDUP_JOURNAL_MODE ?? "DELETE").toUpperCase() === "WAL"
  ? "WAL"
  : "DELETE";

/** Cached on globalThis so a dev-server hot reload reuses the open handle. */
const globalRef = globalThis as typeof globalThis & {
  __standupDb?: DatabaseSync;
  __standupDbShutdownHooked?: boolean;
};

/**
 * Module scope, not global scope, and deliberately so: a hot reload re-evaluates this
 * module and resets the flag, which re-runs the column check against the handle the
 * previous version left on globalThis. Editing SECTION_KEYS therefore migrates the
 * open database instead of waiting for a server restart.
 */
let columnsChecked = false;

function open(): DatabaseSync {
  const cached = globalRef.__standupDb;
  if (cached) {
    if (!columnsChecked) {
      addMissingColumns(cached);
      columnsChecked = true;
    }
    return cached;
  }

  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const db = new DatabaseSync(DB_FILE);

  // DELETE keeps the database one self-contained file you can copy to back up, which is
  // right for a single process. WAL lets many readers run alongside a writer, which is
  // right once this is deployed for a team. Neither is universally correct, so it is a
  // deployment decision rather than a hardcoded one. `VACUUM INTO` (scripts/backup.mjs)
  // produces a single consistent file either way, so the one-file property survives WAL.
  db.exec(`PRAGMA journal_mode = ${JOURNAL_MODE}`);
  db.exec(`PRAGMA synchronous = ${JOURNAL_MODE === "WAL" ? "NORMAL" : "FULL"}`);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  if (JOURNAL_MODE === "WAL") db.exec("PRAGMA journal_size_limit = 6291456");

  db.exec(SCHEMA);
  addMissingColumns(db);
  columnsChecked = true;
  globalRef.__standupDb = db;
  runMigrations(db);
  seedIssueReferenceData(db);
  seedIfEmpty(db);
  backfillProjectTrackerDefaults(db);
  registerShutdown(db);
  return db;
}

/**
 * Close the handle on the way out so WAL is checkpointed and its -wal/-shm siblings are
 * removed, leaving one file behind.
 *
 * Signal handlers are registered in production only. In development, taking over SIGINT
 * would stop Ctrl-C from working the way the dev server expects.
 */
function registerShutdown(db: DatabaseSync): void {
  if (globalRef.__standupDbShutdownHooked) return;
  globalRef.__standupDbShutdownHooked = true;

  const close = () => {
    try {
      db.close();
    } catch {
      /* already closed, or mid-statement — nothing useful to do while exiting */
    }
  };

  process.once("exit", close);
  if (process.env.NODE_ENV === "production") {
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      process.once(signal, () => {
        close();
        process.exit(0);
      });
    }
  }
}

/**
 * Runs once in the life of a database file, tracked by a settings flag rather than by
 * "are there any projects". Counting rows would resurrect the sample project every time
 * the server restarted after you deleted the last real one.
 */
function seedIfEmpty(db: DatabaseSync): void {
  if (getSetting("seeded", db) !== null) return;
  setSetting("seeded", "1", db);

  const row = db.prepare("SELECT COUNT(*) AS n FROM projects").get() as { n: number };
  if (row.n > 0) return; // an existing database predating this flag

  const projectId = newId("prj");
  const labelColumns = SECTION_KEYS.map(labelColumn);
  db.prepare(
    `INSERT INTO projects (id, name, title_template, created_at, sort_order, ${labelColumns.join(", ")})
     VALUES (?, ?, ?, ?, 0, ${labelColumns.map(() => "?").join(", ")})`,
  ).run(
    projectId,
    "Go Style",
    DEFAULT_TITLE_TEMPLATE,
    new Date().toISOString(),
    ...SECTION_KEYS.map((key) => DEFAULT_LABELS[key]),
  );

  const insertPerson = db.prepare(
    "INSERT INTO people (id, project_id, name, active, sort_order) VALUES (?, ?, ?, 1, ?)",
  );
  ["Nihal", "Nazirul", "Saad", "Imran", "Talha bhai"].forEach((name, i) => {
    insertPerson.run(newId("psn"), projectId, name, i);
  });

  setSetting("lastProjectId", projectId, db);
}

/* ------------------------------------------------------------------ *
 * Row mapping
 * ------------------------------------------------------------------ */

type Row = Record<string, string | number | null>;

const toPerson = (r: Row): Person => ({
  id: String(r.id),
  name: String(r.name),
  active: r.active === 1,
});

function toProject(r: Row, people: Person[]): Project {
  const labels = {} as Record<SectionKey, string>;
  for (const key of SECTION_KEYS) {
    labels[key] = String(r[labelColumn(key)] || DEFAULT_LABELS[key]);
  }
  return {
    id: String(r.id),
    name: String(r.name),
    titleTemplate: String(r.title_template ?? ""),
    createdAt: String(r.created_at ?? ""),
    labels,
    people,
  };
}

function toEntry(r: Row): Entry {
  const entry = { updatedAt: String(r.updated_at ?? "") } as Entry;
  for (const key of SECTION_KEYS) entry[key] = String(r[key] ?? "");
  return entry;
}

/* ------------------------------------------------------------------ *
 * Projects & people
 * ------------------------------------------------------------------ */

export function listProjects(): Project[] {
  const db = open();
  const projectRows = db
    .prepare("SELECT * FROM projects ORDER BY sort_order, created_at")
    .all() as unknown as Row[];
  const peopleRows = db
    .prepare("SELECT * FROM people ORDER BY sort_order, rowid")
    .all() as unknown as Row[];

  const byProject = new Map<string, Person[]>();
  for (const row of peopleRows) {
    const list = byProject.get(String(row.project_id)) ?? [];
    list.push(toPerson(row));
    byProject.set(String(row.project_id), list);
  }
  return projectRows.map((r) => toProject(r, byProject.get(String(r.id)) ?? []));
}

export function getProject(id: string): Project | null {
  const db = open();
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as unknown as
    | Row
    | undefined;
  if (!row) return null;
  const people = (
    db
      .prepare("SELECT * FROM people WHERE project_id = ? ORDER BY sort_order, rowid")
      .all(id) as unknown as Row[]
  ).map(toPerson);
  return toProject(row, people);
}

export function getProjectByKey(key: string): Project | null {
  const row = open()
    .prepare("SELECT id FROM projects WHERE key = ? COLLATE NOCASE")
    .get(key) as { id: string } | undefined;
  return row ? getProject(row.id) : null;
}

export function projectExists(id: string): boolean {
  return open().prepare("SELECT 1 FROM projects WHERE id = ?").get(id) !== undefined;
}

export function createProject(name: string, peopleNames: string[] = []): Project {
  const id = newId("prj");
  const labelColumns = SECTION_KEYS.map(labelColumn);

  withWrite((tx) => {
    // Read inside the transaction: outside it, two concurrent creates could both read
    // the same max and land on the same sort_order.
    const next = tx
      .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM projects")
      .get() as { n: number };
    tx.prepare(
      `INSERT INTO projects (id, name, title_template, created_at, sort_order, ${labelColumns.join(", ")})
       VALUES (?, ?, ?, ?, ?, ${labelColumns.map(() => "?").join(", ")})`,
    ).run(
      id,
      name,
      DEFAULT_TITLE_TEMPLATE,
      new Date().toISOString(),
      next.n,
      ...SECTION_KEYS.map((key) => DEFAULT_LABELS[key]),
    );
    const insertPerson = tx.prepare(
      "INSERT INTO people (id, project_id, name, active, sort_order) VALUES (?, ?, ?, 1, ?)",
    );
    peopleNames.forEach((personName, i) => insertPerson.run(newId("psn"), id, personName, i));
    ensureProjectTrackerDefaults(tx, id, name);
  });

  setSetting("lastProjectId", id);
  return getProject(id)!;
}

export interface ProjectPatch {
  name?: string;
  titleTemplate?: string;
  labels?: Partial<Record<SectionKey, string>>;
  people?: { id?: string; name: string; active: boolean }[];
}

export function updateProject(id: string, patch: ProjectPatch): Project | null {
  if (!projectExists(id)) return null;

  withWrite((db) => {
    const sets: string[] = [];
    const values: string[] = [];
    if (patch.name !== undefined) {
      sets.push("name = ?");
      values.push(patch.name);
    }
    if (patch.titleTemplate !== undefined) {
      sets.push("title_template = ?");
      values.push(patch.titleTemplate);
    }
    for (const key of SECTION_KEYS) {
      const label = patch.labels?.[key];
      if (label !== undefined) {
        sets.push(`${labelColumn(key)} = ?`);
        values.push(label);
      }
    }
    if (sets.length) {
      db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
    }

    // The roster arrives whole, which covers add / rename / reorder / remove in one
    // call. Rows keep their id — and therefore their entry history — when one is given.
    if (patch.people) {
      const existing = new Set(
        (
          db.prepare("SELECT id FROM people WHERE project_id = ?").all(id) as unknown as {
            id: string;
          }[]
        ).map((r) => r.id),
      );
      const keep = new Set<string>();
      const upsert = db.prepare(
        `INSERT INTO people (id, project_id, name, active, sort_order) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, active = excluded.active, sort_order = excluded.sort_order`,
      );
      patch.people.forEach((person, index) => {
        const personId = person.id && existing.has(person.id) ? person.id : newId("psn");
        if (keep.has(personId)) return;
        keep.add(personId);
        upsert.run(personId, id, person.name, person.active ? 1 : 0, index);
      });

      // Removing someone from the roster must not destroy what they wrote. In a
      // single-user app a confirm dialog was enough; once colleagues share a project,
      // one person must not be able to erase another's history that easily. A row with
      // entries is deactivated — which is what the app already promises "unticking"
      // does — and only a row that has never written anything is actually deleted.
      const hasEntries = db.prepare("SELECT 1 FROM entries WHERE person_id = ? LIMIT 1");
      for (const staleId of existing) {
        if (keep.has(staleId)) continue;
        if (hasEntries.get(staleId) === undefined) {
          db.prepare("DELETE FROM people WHERE id = ?").run(staleId);
        } else {
          db.prepare("UPDATE people SET active = 0 WHERE id = ?").run(staleId);
        }
      }
    }
  });

  return getProject(id);
}

export function deleteProject(id: string): boolean {
  const db = open();
  const result = db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  if (result.changes === 0) return false;
  if (getSetting("lastProjectId") === id) {
    const first = db.prepare("SELECT id FROM projects ORDER BY sort_order LIMIT 1").get() as
      | { id: string }
      | undefined;
    if (first) setSetting("lastProjectId", first.id);
    else db.prepare("DELETE FROM settings WHERE key = 'lastProjectId'").run();
  }
  return true;
}

export function personBelongsToProject(projectId: string, personId: string): boolean {
  return (
    open()
      .prepare("SELECT 1 FROM people WHERE id = ? AND project_id = ?")
      .get(personId, projectId) !== undefined
  );
}

/* ------------------------------------------------------------------ *
 * Entries
 * ------------------------------------------------------------------ */

export function entriesForDate(projectId: string, date: string): Record<string, Entry> {
  const rows = open()
    .prepare("SELECT * FROM entries WHERE project_id = ? AND date = ?")
    .all(projectId, date) as unknown as Row[];

  const out: Record<string, Entry> = {};
  for (const row of rows) out[String(row.person_id)] = toEntry(row);
  return out;
}

export function setEntry(
  projectId: string,
  date: string,
  personId: string,
  patch: Partial<EntryText>,
): Entry {
  const db = open();
  const current = db
    .prepare("SELECT * FROM entries WHERE project_id = ? AND date = ? AND person_id = ?")
    .get(projectId, date, personId) as unknown as Row | undefined;

  const text = {} as EntryText;
  for (const key of SECTION_KEYS) {
    text[key] = patch[key] ?? String(current?.[key] ?? "");
  }
  const updatedAt = new Date().toISOString();

  // An emptied entry is deleted rather than stored blank, which keeps
  // "days that have content" queries honest.
  if (SECTION_KEYS.every((key) => !text[key].trim())) {
    db.prepare("DELETE FROM entries WHERE project_id = ? AND date = ? AND person_id = ?").run(
      projectId,
      date,
      personId,
    );
    return { ...emptyText(), updatedAt };
  }

  const columns = SECTION_KEYS.join(", ");
  const placeholders = SECTION_KEYS.map(() => "?").join(", ");
  const updates = SECTION_KEYS.map((key) => `${key} = excluded.${key}`).join(", ");
  db.prepare(
    `INSERT INTO entries (project_id, date, person_id, updated_at, ${columns})
     VALUES (?, ?, ?, ?, ${placeholders})
     ON CONFLICT(project_id, date, person_id)
     DO UPDATE SET updated_at = excluded.updated_at, ${updates}`,
  ).run(projectId, date, personId, updatedAt, ...SECTION_KEYS.map((key) => text[key]));

  return { ...text, updatedAt };
}

function emptyText(): EntryText {
  const text = {} as EntryText;
  for (const key of SECTION_KEYS) text[key] = "";
  return text;
}

/** Most recent day before `date` that has anything saved for this project. */
export function previousDateWithContent(projectId: string, before: string): string | null {
  const row = open()
    .prepare("SELECT MAX(date) AS date FROM entries WHERE project_id = ? AND date < ?")
    .get(projectId, before) as { date: string | null } | undefined;
  return row?.date ?? null;
}

/** Every day with content, newest first. */
export function datesWithContent(projectId: string): string[] {
  const rows = open()
    .prepare("SELECT DISTINCT date FROM entries WHERE project_id = ? ORDER BY date DESC")
    .all(projectId) as unknown as { date: string }[];
  return rows.map((r) => r.date);
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export function getSetting(key: string, db: DatabaseSync = open()): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string, db: DatabaseSync = open()): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

/* ------------------------------------------------------------------ *
 * Accounts and sessions
 * ------------------------------------------------------------------ */

function toUser(r: Row): User {
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    role: (String(r.role) === "admin" ? "admin" : "member") as Role,
    status: String(r.status) as UserStatus,
    hasPassword: r.password_hash != null && String(r.password_hash).length > 0,
    createdAt: String(r.created_at),
    lastLoginAt: r.last_login_at == null ? null : String(r.last_login_at),
  };
}

/** Zero means the app has never been set up, which is what puts it in setup mode. */
export function countUsers(): number {
  return (open().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

export function listUsers(): User[] {
  return (
    open().prepare("SELECT * FROM users ORDER BY name COLLATE NOCASE").all() as unknown as Row[]
  ).map(toUser);
}

export function getUser(id: string): User | null {
  const row = open().prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as
    | Row
    | undefined;
  return row ? toUser(row) : null;
}

/** Returns the stored hash alongside the user — only the sign-in path should call this. */
export function findUserForSignIn(
  email: string,
): { user: User; passwordHash: string | null } | null {
  const row = open()
    .prepare("SELECT * FROM users WHERE lower(email) = lower(?)")
    .get(email) as unknown as Row | undefined;
  if (!row) return null;
  return {
    user: toUser(row),
    passwordHash: row.password_hash == null ? null : String(row.password_hash),
  };
}

export interface NewUser {
  email: string;
  name: string;
  passwordHash: string | null;
  role: Role;
  status: UserStatus;
}

export function createUser(input: NewUser): User {
  const id = newId("usr");
  withWrite((tx) => {
    tx.prepare(
      `INSERT INTO users (id, email, name, password_hash, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.email,
      input.name,
      input.passwordHash,
      input.role,
      input.status,
      new Date().toISOString(),
    );
  });
  return getUser(id)!;
}

/**
 * Create the first account, refusing if one already exists.
 *
 * The count is re-checked *inside* the transaction on purpose: two people opening the
 * setup page at the same moment must not both become admin.
 */
export function createFirstAdmin(input: Omit<NewUser, "role" | "status">): User | "already-setup" {
  const id = newId("usr");
  const result = withWrite((tx) => {
    const { n } = tx.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
    if (n > 0) return "already-setup" as const;
    tx.prepare(
      `INSERT INTO users (id, email, name, password_hash, role, status, created_at)
       VALUES (?, ?, ?, ?, 'admin', 'active', ?)`,
    ).run(id, input.email, input.name, input.passwordHash, new Date().toISOString());
    return "created" as const;
  });
  return result === "already-setup" ? result : getUser(id)!;
}

export function setUserPassword(userId: string, passwordHash: string): void {
  withWrite((tx) => {
    tx.prepare("UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?").run(
      passwordHash,
      userId,
    );
    // A password change invalidates every other session for that account.
    tx.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  });
}

export function recordLogin(userId: string): void {
  withWrite((tx) =>
    tx.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      userId,
    ),
  );
}

export function createSession(input: {
  id: string;
  userId: string;
  expiresAt: string;
  userAgent: string | null;
}): void {
  const now = new Date().toISOString();
  withWrite((tx) => {
    // Opportunistic sweep: no cron, and login is the natural moment for it.
    tx.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
    tx.prepare(
      `INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(input.id, input.userId, now, now, input.expiresAt, input.userAgent);
  });
}

/** Looks up a live session and its user. Expired rows are treated as absent. */
export function findSession(id: string): { session: Session; user: User } | null {
  const row = open()
    .prepare(
      `SELECT s.id, s.user_id, s.created_at, s.last_seen_at, s.expires_at, u.*
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(id, new Date().toISOString()) as unknown as Row | undefined;
  if (!row) return null;
  return {
    session: {
      id: String(row.id),
      userId: String(row.user_id),
      createdAt: String(row.created_at),
      lastSeenAt: String(row.last_seen_at),
      expiresAt: String(row.expires_at),
    },
    user: toUser(row),
  };
}

/** Slides the expiry and records activity. Both writes are throttled by the caller. */
export function refreshSession(id: string, expiresAt: string | null): void {
  const now = new Date().toISOString();
  withWrite((tx) => {
    if (expiresAt) {
      tx.prepare("UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE id = ?").run(
        expiresAt,
        now,
        id,
      );
    } else {
      tx.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now, id);
    }
  });
}

export function deleteSession(id: string): void {
  withWrite((tx) => tx.prepare("DELETE FROM sessions WHERE id = ?").run(id));
}

export function deleteUserSessions(userId: string): void {
  withWrite((tx) => tx.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId));
}

/* ------------------------------------------------------------------ *
 * Invitations
 * ------------------------------------------------------------------ */

function toInvite(r: Row): Invite {
  return {
    id: String(r.id),
    email: String(r.email),
    name: r.name == null ? null : String(r.name),
    role: (String(r.role) === "admin" ? "admin" : "member") as Role,
    personId: r.person_id == null ? null : String(r.person_id),
    createdAt: String(r.created_at),
    expiresAt: String(r.expires_at),
    acceptedAt: r.accepted_at == null ? null : String(r.accepted_at),
  };
}

export function createInvite(input: {
  tokenHash: string;
  email: string;
  name: string | null;
  role: Role;
  personId: string | null;
  createdBy: string;
  expiresAt: string;
}): Invite {
  const id = newId("inv");
  withWrite((tx) => {
    // One live invite per roster row: re-inviting replaces the previous link rather
    // than leaving two valid URLs in two different chats.
    if (input.personId) {
      tx.prepare("DELETE FROM invites WHERE person_id = ? AND accepted_at IS NULL").run(
        input.personId,
      );
    }
    tx.prepare(
      `INSERT INTO invites (id, token_hash, email, name, role, person_id, created_by, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.tokenHash,
      input.email,
      input.name,
      input.role,
      input.personId,
      input.createdBy,
      new Date().toISOString(),
      input.expiresAt,
    );
  });
  return getInvite(id)!;
}

export function getInvite(id: string): Invite | null {
  const row = open().prepare("SELECT * FROM invites WHERE id = ?").get(id) as unknown as
    | Row
    | undefined;
  return row ? toInvite(row) : null;
}

/** A live, unaccepted, unexpired invite plus the roster row and project it belongs to. */
export function findLiveInvite(
  tokenHash: string,
): { invite: Invite; personName: string | null; projectName: string | null } | null {
  const row = open()
    .prepare(
      `SELECT i.*, p.name AS person_name, pr.name AS project_name
         FROM invites i
         LEFT JOIN people p ON p.id = i.person_id
         LEFT JOIN projects pr ON pr.id = p.project_id
        WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.expires_at > ?`,
    )
    .get(tokenHash, new Date().toISOString()) as unknown as Row | undefined;
  if (!row) return null;
  return {
    invite: toInvite(row),
    personName: row.person_name == null ? null : String(row.person_name),
    projectName: row.project_name == null ? null : String(row.project_name),
  };
}

export function listInvitesForProject(projectId: string): Invite[] {
  return (
    open()
      .prepare(
        `SELECT i.* FROM invites i
           JOIN people p ON p.id = i.person_id
          WHERE p.project_id = ? AND i.accepted_at IS NULL AND i.expires_at > ?`,
      )
      .all(projectId, new Date().toISOString()) as unknown as Row[]
  ).map(toInvite);
}

export function revokeInvite(id: string): void {
  withWrite((tx) => tx.prepare("DELETE FROM invites WHERE id = ? AND accepted_at IS NULL").run(id));
}

export type AcceptResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "gone" | "seat-taken" | "email-taken" };

/**
 * Turn an invite into an account, in one transaction.
 *
 * Everything is re-checked inside the transaction: the invite is re-read by hash, the
 * roster row is only claimed if it is still unclaimed, and the email is only inserted
 * if it is still free. That is what makes a double-submit — or two people opening the
 * same link — safe rather than a race.
 */
export function acceptInvite(input: {
  tokenHash: string;
  name: string;
  passwordHash: string;
}): AcceptResult {
  return withWrite((tx): AcceptResult => {
    const row = tx
      .prepare(
        "SELECT * FROM invites WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?",
      )
      .get(input.tokenHash, new Date().toISOString()) as unknown as Row | undefined;
    if (!row) return { ok: false, reason: "gone" };

    const invite = toInvite(row);

    // An existing account for this address joins the roster row instead of a duplicate
    // being created — that is how one person ends up on two projects.
    const existing = tx
      .prepare("SELECT id FROM users WHERE lower(email) = lower(?)")
      .get(invite.email) as { id: string } | undefined;

    let userId: string;
    if (existing) {
      userId = existing.id;
    } else {
      userId = newId("usr");
      tx.prepare(
        `INSERT INTO users (id, email, name, password_hash, role, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      ).run(
        userId,
        invite.email,
        input.name,
        input.passwordHash,
        invite.role,
        new Date().toISOString(),
      );
    }

    if (invite.personId) {
      const seat = tx.prepare("SELECT user_id FROM people WHERE id = ?").get(invite.personId) as
        | { user_id: string | null }
        | undefined;
      if (!seat) return { ok: false, reason: "gone" };
      if (seat.user_id && seat.user_id !== userId) return { ok: false, reason: "seat-taken" };
      tx.prepare("UPDATE people SET user_id = ?, active = 1 WHERE id = ?").run(
        userId,
        invite.personId,
      );
    }

    tx.prepare(
      "UPDATE invites SET accepted_at = ?, accepted_user_id = ? WHERE id = ?",
    ).run(new Date().toISOString(), userId, invite.id);

    return { ok: true, userId };
  });
}

/** The account attached to each roster row, for the People screen. */
export function accountsForProject(projectId: string): Record<string, User> {
  const rows = open()
    .prepare(
      `SELECT p.id AS person_id, u.* FROM people p
         JOIN users u ON u.id = p.user_id
        WHERE p.project_id = ?`,
    )
    .all(projectId) as unknown as Row[];
  const out: Record<string, User> = {};
  for (const row of rows) out[String(row.person_id)] = toUser(row);
  return out;
}

export function isProjectMember(userId: string, projectId: string): boolean {
  return (
    open()
      .prepare("SELECT 1 FROM people WHERE user_id = ? AND project_id = ? LIMIT 1")
      .get(userId, projectId) !== undefined
  );
}

/** Projects this person can see: everything for an admin, their rosters otherwise. */
export function projectsVisibleTo(user: User): Project[] {
  if (user.role === "admin") return listProjects();
  const ids = new Set(
    (
      open()
        .prepare("SELECT DISTINCT project_id FROM people WHERE user_id = ?")
        .all(user.id) as unknown as { project_id: string }[]
    ).map((r) => r.project_id),
  );
  return listProjects().filter((p) => ids.has(p.id));
}

/* ------------------------------------------------------------------ *
 * Statuses
 * ------------------------------------------------------------------ */

const toStatus = (r: Row): Status => ({
  id: String(r.id),
  projectId: String(r.project_id),
  name: String(r.name),
  category: String(r.category) as StatusCategory,
  isDone: r.is_done === 1,
  isDefault: r.is_default === 1,
  color: String(r.color),
  sortOrder: Number(r.sort_order),
});

export function listStatuses(projectId: string): Status[] {
  return (
    open()
      .prepare("SELECT * FROM statuses WHERE project_id = ? ORDER BY sort_order, name")
      .all(projectId) as unknown as Row[]
  ).map(toStatus);
}

/* ------------------------------------------------------------------ *
 * Issues
 * ------------------------------------------------------------------ */

function toIssue(r: Row, projectKey: string): Issue {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    number: Number(r.number),
    key: `${projectKey}-${Number(r.number)}`,
    type: String(r.type) as IssueType,
    parentId: r.parent_id == null ? null : String(r.parent_id),
    statusId: String(r.status_id),
    title: String(r.title),
    description: String(r.description ?? ""),
    assigneePersonId: r.assignee_person_id == null ? null : String(r.assignee_person_id),
    reporterUserId: r.reporter_user_id == null ? null : String(r.reporter_user_id),
    priority: Number(r.priority),
    estimate: r.estimate == null ? null : Number(r.estimate),
    rank: String(r.rank),
    path: String(r.path),
    depth: Number(r.depth),
    rootId: String(r.root_id),
    version: Number(r.version),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    resolvedAt: r.resolved_at == null ? null : String(r.resolved_at),
    archivedAt: r.archived_at == null ? null : String(r.archived_at),
  };
}

function projectKeyOf(db: DatabaseSync, projectId: string): string {
  const row = db.prepare("SELECT key FROM projects WHERE id = ?").get(projectId) as
    | { key: string | null }
    | undefined;
  return row?.key ?? "?";
}

/** Ancestor ids as `/a/b/`. The mover's own subtree is everything under this plus its id. */
const prefixOf = (issue: { path: string; id: string }) => `${issue.path}${issue.id}/`;

/** Upper bound for a `path >= x AND path < y` range scan. Never use LIKE — it cannot use the index. */
function rangeEnd(prefix: string): string {
  const last = prefix.charCodeAt(prefix.length - 1);
  return prefix.slice(0, -1) + String.fromCharCode(last + 1);
}

/**
 * Arrange rows parent-then-children, siblings by rank.
 *
 * Cheap: one pass to bucket by parent, then a stack walk. Doing it here rather than in
 * SQL is what lets `rank` be a single-row update.
 */
export function orderDepthFirst(issues: Issue[]): Issue[] {
  const byParent = new Map<string | null, Issue[]>();
  for (const issue of issues) {
    const siblings = byParent.get(issue.parentId) ?? [];
    siblings.push(issue);
    byParent.set(issue.parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id < b.id ? -1 : 1));
  }

  const present = new Set(issues.map((i) => i.id));
  const out: Issue[] = [];
  const visit = (parentId: string | null) => {
    for (const issue of byParent.get(parentId) ?? []) {
      out.push(issue);
      visit(issue.id);
    }
  };
  visit(null);

  // A filtered list can contain a child whose parent was excluded; keep it rather than
  // silently dropping it.
  if (out.length < issues.length) {
    for (const issue of issues) {
      if (!out.includes(issue) && (issue.parentId === null || !present.has(issue.parentId))) {
        out.push(issue);
        visit(issue.id);
      }
    }
  }
  return out;
}

export type IssueError =
  | "no-project"
  | "no-parent"
  | "illegal-parent"
  | "illegal-root"
  | "cycle"
  | "too-deep"
  | "not-found"
  | "conflict";

export interface NewIssue {
  projectId: string;
  type: IssueType;
  title: string;
  description?: string;
  parentId?: string | null;
  statusId?: string | null;
  assigneePersonId?: string | null;
  reporterUserId?: string | null;
  priority?: number;
}

export function createIssue(input: NewIssue): Issue | IssueError {
  const id = newId("iss");

  const result = withWrite((tx): IssueError | null => {
    const project = tx.prepare("SELECT id, key FROM projects WHERE id = ?").get(input.projectId);
    if (!project) return "no-project";

    let parent: Row | undefined;
    if (input.parentId) {
      parent = tx
        .prepare("SELECT * FROM issues WHERE id = ? AND project_id = ?")
        .get(input.parentId, input.projectId) as unknown as Row | undefined;
      if (!parent) return "no-parent";
      if (!PARENT_RULES[input.type].includes(String(parent.type) as IssueType)) {
        return "illegal-parent";
      }
      if (Number(parent.depth) + 1 > MAX_DEPTH) return "too-deep";
    } else if (!ROOT_TYPES.includes(input.type)) {
      return "illegal-root";
    }

    const statusId =
      input.statusId ??
      (
        tx
          .prepare(
            "SELECT id FROM statuses WHERE project_id = ? ORDER BY is_default DESC, sort_order LIMIT 1",
          )
          .get(input.projectId) as { id: string } | undefined
      )?.id;
    if (!statusId) return "no-project";

    // Allocated atomically. MAX(number)+1 would reuse a number after a delete, so a stale
    // link to GS-42 would silently resolve to a different issue.
    const { number } = tx
      .prepare(
        "UPDATE projects SET next_issue_number = next_issue_number + 1 WHERE id = ? RETURNING next_issue_number - 1 AS number",
      )
      .get(input.projectId) as { number: number };

    const last = tx
      .prepare(
        `SELECT rank FROM issues
          WHERE project_id = ? AND ${input.parentId ? "parent_id = ?" : "parent_id IS NULL"}
          ORDER BY rank DESC LIMIT 1`,
      )
      .get(...(input.parentId ? [input.projectId, input.parentId] : [input.projectId])) as
      | { rank: string }
      | undefined;

    const path = parent ? prefixOf({ path: String(parent.path), id: String(parent.id) }) : "/";
    const depth = parent ? Number(parent.depth) + 1 : 0;
    const rootId = parent ? String(parent.root_id) : id;
    const now = new Date().toISOString();

    tx.prepare(
      `INSERT INTO issues (id, project_id, number, type, parent_id, status_id, title, description,
                           assignee_person_id, reporter_user_id, priority, rank, path, depth, root_id,
                           created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.projectId,
      number,
      input.type,
      input.parentId ?? null,
      statusId,
      input.title,
      input.description ?? "",
      input.assigneePersonId ?? null,
      input.reporterUserId ?? null,
      input.priority ?? 3,
      rankBetween(last?.rank ?? null, null),
      path,
      depth,
      rootId,
      now,
      now,
    );
    return null;
  });

  return result ?? getIssue(id)!;
}

export function getIssue(id: string): Issue | null {
  const db = open();
  const row = db.prepare("SELECT * FROM issues WHERE id = ?").get(id) as unknown as Row | undefined;
  return row ? toIssue(row, projectKeyOf(db, String(row.project_id))) : null;
}

/** Resolves a display key like `GS-142`, which carries its own project. */
export function getIssueByKey(key: string): Issue | null {
  const match = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(key.trim());
  if (!match) return null;
  const project = getProjectByKey(match[1]);
  return project ? getIssueByNumber(project.id, Number(match[2])) : null;
}

export function getIssueByNumber(projectId: string, number: number): Issue | null {
  const db = open();
  const row = db
    .prepare("SELECT * FROM issues WHERE project_id = ? AND number = ?")
    .get(projectId, number) as unknown as Row | undefined;
  return row ? toIssue(row, projectKeyOf(db, projectId)) : null;
}

export interface IssueQuery {
  includeArchived?: boolean;
  /** Only this subtree, root included. */
  under?: string;
}

/**
 * Every issue in the project, ordered by path then rank.
 *
 * That groups each parent's children together but is NOT depth-first: paths are built
 * from ids, so every row at one depth sorts before any row a level below it. True
 * depth-first order would need paths built from rank keys, which would turn every
 * reorder into a subtree rewrite — far too expensive for the commonest gesture there is.
 * Use `orderDepthFirst` on the result when display order matters.
 */
export function listIssues(projectId: string, query: IssueQuery = {}): Issue[] {
  const db = open();
  const key = projectKeyOf(db, projectId);
  const where: string[] = ["project_id = ?"];
  const args: (string | number)[] = [projectId];

  if (!query.includeArchived) where.push("archived_at IS NULL");
  if (query.under) {
    const root = db.prepare("SELECT id, path FROM issues WHERE id = ?").get(query.under) as
      | { id: string; path: string }
      | undefined;
    if (!root) return [];
    const prefix = prefixOf(root);
    where.push("(id = ? OR (path >= ? AND path < ?))");
    args.push(root.id, prefix, rangeEnd(prefix));
  }

  return (
    db
      .prepare(`SELECT * FROM issues WHERE ${where.join(" AND ")} ORDER BY path, rank, id`)
      .all(...args) as unknown as Row[]
  ).map((r) => toIssue(r, key));
}

export interface IssuePatch {
  title?: string;
  description?: string;
  statusId?: string;
  assigneePersonId?: string | null;
  priority?: number;
  estimate?: number | null;
}

/**
 * Edit an issue's own fields.
 *
 * `expectedVersion` guards the fields people type into: two people editing the same
 * description should not silently lose one of them. Drag-driven changes deliberately do
 * not pass a version — there, last write wins is what a user expects, and a conflict
 * dialog mid-drag would be absurd.
 */
export function updateIssue(
  id: string,
  patch: IssuePatch,
  expectedVersion?: number,
): Issue | IssueError {
  const outcome = withWrite((tx): IssueError | null => {
    const current = tx.prepare("SELECT * FROM issues WHERE id = ?").get(id) as unknown as
      | Row
      | undefined;
    if (!current) return "not-found";

    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    const set = (column: string, value: string | number | null) => {
      sets.push(`${column} = ?`);
      args.push(value);
    };

    if (patch.title !== undefined) set("title", patch.title);
    if (patch.description !== undefined) set("description", patch.description);
    if (patch.assigneePersonId !== undefined) set("assignee_person_id", patch.assigneePersonId);
    if (patch.priority !== undefined) set("priority", patch.priority);
    if (patch.estimate !== undefined) set("estimate", patch.estimate);

    if (patch.statusId !== undefined) {
      const status = tx
        .prepare("SELECT is_done FROM statuses WHERE id = ? AND project_id = ?")
        .get(patch.statusId, String(current.project_id)) as { is_done: number } | undefined;
      if (!status) return "not-found";
      set("status_id", patch.statusId);
      // Stamped here so cycle time is a column rather than a scan of the activity log.
      set("resolved_at", status.is_done === 1 ? new Date().toISOString() : null);
    }

    if (!sets.length) return null;
    set("updated_at", new Date().toISOString());

    const where = expectedVersion === undefined ? "id = ?" : "id = ? AND version = ?";
    const whereArgs = expectedVersion === undefined ? [id] : [id, expectedVersion];
    const { changes } = tx
      .prepare(`UPDATE issues SET ${sets.join(", ")}, version = version + 1 WHERE ${where}`)
      .run(...args, ...whereArgs);

    return changes === 0 ? "conflict" : null;
  });

  return outcome ?? getIssue(id)!;
}

export interface MoveIssue {
  /** Undefined leaves the parent alone; null detaches to the top of the tree. */
  parentId?: string | null;
  /** New neighbours among the destination's children, for ordering. */
  afterId?: string | null;
  beforeId?: string | null;
}

/**
 * Re-parent and/or reorder, in one transaction.
 *
 * The subtree is rewritten by a single UPDATE over an indexed path range. The checks
 * before it — legal parent type, no cycle, depth still within bounds counting the whole
 * subtree — all run first, because an illegal move is refused outright rather than
 * coerced into something legal.
 */
export function moveIssue(id: string, move: MoveIssue): Issue | IssueError {
  const outcome = withWrite((tx): IssueError | null => {
    const mover = tx.prepare("SELECT * FROM issues WHERE id = ?").get(id) as unknown as
      | Row
      | undefined;
    if (!mover) return "not-found";

    const projectId = String(mover.project_id);
    const type = String(mover.type) as IssueType;
    const reparenting = move.parentId !== undefined;
    const newParentId: string | null = reparenting
      ? (move.parentId ?? null)
      : mover.parent_id == null
        ? null
        : String(mover.parent_id);

    let parent: Row | undefined;
    if (newParentId) {
      parent = tx
        .prepare("SELECT * FROM issues WHERE id = ? AND project_id = ?")
        .get(newParentId, projectId) as unknown as Row | undefined;
      if (!parent) return "no-parent";
      if (!PARENT_RULES[type].includes(String(parent.type) as IssueType)) return "illegal-parent";
    } else if (!ROOT_TYPES.includes(type)) {
      return "illegal-root";
    }

    const oldPrefix = prefixOf({ path: String(mover.path), id });

    if (parent) {
      // Dropping something inside its own subtree would detach that subtree from the tree.
      const target = `${String(parent.path)}${String(parent.id)}/`;
      if (target.startsWith(oldPrefix) || String(parent.id) === id) return "cycle";
    }

    const newDepth = parent ? Number(parent.depth) + 1 : 0;
    const { maxDepth } = tx
      .prepare(
        "SELECT COALESCE(MAX(depth), ?) AS maxDepth FROM issues WHERE project_id = ? AND path >= ? AND path < ?",
      )
      .get(Number(mover.depth), projectId, oldPrefix, rangeEnd(oldPrefix)) as { maxDepth: number };
    // A CHECK alone would allow a shallow move that pushes deep descendants over the cap.
    if (newDepth + (maxDepth - Number(mover.depth)) > MAX_DEPTH) return "too-deep";

    const siblingsSql = newParentId
      ? "SELECT rank FROM issues WHERE project_id = ? AND parent_id = ? AND id <> ? ORDER BY rank"
      : "SELECT rank FROM issues WHERE project_id = ? AND parent_id IS NULL AND id <> ? ORDER BY rank";
    const siblingArgs = newParentId ? [projectId, newParentId, id] : [projectId, id];
    const siblings = (tx.prepare(siblingsSql).all(...siblingArgs) as unknown as { rank: string }[])
      .map((r) => r.rank);

    let before: string | null = null;
    let after: string | null = null;
    if (move.afterId) {
      const row = tx.prepare("SELECT rank FROM issues WHERE id = ?").get(move.afterId) as
        | { rank: string }
        | undefined;
      before = row?.rank ?? null;
      after = siblings.find((r) => before !== null && r > before) ?? null;
    } else if (move.beforeId) {
      const row = tx.prepare("SELECT rank FROM issues WHERE id = ?").get(move.beforeId) as
        | { rank: string }
        | undefined;
      after = row?.rank ?? null;
      before = [...siblings].reverse().find((r) => after !== null && r < after) ?? null;
    } else if (reparenting) {
      before = siblings.length ? siblings[siblings.length - 1] : null;
    }

    const rank =
      move.afterId || move.beforeId || reparenting
        ? rankBetween(before, after)
        : String(mover.rank);

    const newPath = parent ? `${String(parent.path)}${String(parent.id)}/` : "/";
    const newRoot = parent ? String(parent.root_id) : id;
    const newPrefix = `${newPath}${id}/`;
    const delta = newDepth - Number(mover.depth);

    // One statement for the whole subtree, over an indexed range. Never `path LIKE ?`,
    // which does not use the index and would scan the project on every drag.
    if (newPrefix !== oldPrefix || delta !== 0 || newRoot !== String(mover.root_id)) {
      tx.prepare(
        `UPDATE issues
            SET path    = ? || substr(path, ?),
                depth   = depth + ?,
                root_id = ?
          WHERE project_id = ? AND path >= ? AND path < ?`,
      ).run(newPrefix, oldPrefix.length + 1, delta, newRoot, projectId, oldPrefix, rangeEnd(oldPrefix));
    }

    tx.prepare(
      `UPDATE issues
          SET parent_id = ?, path = ?, depth = ?, root_id = ?, rank = ?, updated_at = ?
        WHERE id = ?`,
    ).run(newParentId, newPath, newDepth, newRoot, rank, new Date().toISOString(), id);

    return null;
  });

  return outcome ?? getIssue(id)!;
}

export function archiveIssue(id: string, archived: boolean): Issue | IssueError {
  const outcome = withWrite((tx): IssueError | null => {
    const { changes } = tx
      .prepare("UPDATE issues SET archived_at = ?, updated_at = ? WHERE id = ?")
      .run(archived ? new Date().toISOString() : null, new Date().toISOString(), id);
    return changes === 0 ? "not-found" : null;
  });
  return outcome ?? getIssue(id)!;
}

/**
 * Progress for every root at once.
 *
 * `GROUP BY root_id` rather than joining each root to a path prefix: the prefix form
 * cannot use an index and measured ~100x slower at a few thousand issues.
 */
export interface Rollup {
  rootId: string;
  total: number;
  done: number;
}

export function rollupByRoot(projectId: string): Record<string, Rollup> {
  const rows = open()
    .prepare(
      `SELECT d.root_id AS root_id,
              COUNT(*) AS total,
              SUM(CASE WHEN s.is_done THEN 1 ELSE 0 END) AS done
         FROM issues d
         JOIN statuses s ON s.id = d.status_id
        WHERE d.project_id = ? AND d.archived_at IS NULL AND d.id <> d.root_id
        GROUP BY d.root_id`,
    )
    .all(projectId) as unknown as Row[];

  const out: Record<string, Rollup> = {};
  for (const r of rows) {
    out[String(r.root_id)] = {
      rootId: String(r.root_id),
      total: Number(r.total),
      done: Number(r.done),
    };
  }
  return out;
}

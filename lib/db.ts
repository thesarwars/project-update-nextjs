import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_LABELS,
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
`;

/**
 * The per-section columns are added here rather than in SCHEMA, so that adding a
 * section to SECTION_KEYS also upgrades a database that predates it. Existing rows
 * keep their data and get an empty string for the new section.
 */
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
}

/** Cached on globalThis so a dev-server hot reload reuses the open handle. */
const globalRef = globalThis as typeof globalThis & { __standupDb?: DatabaseSync };

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
  // Rollback journal, not WAL: one self-contained file you can copy to back up, with no
  // -wal/-shm siblings left behind when the dev server is killed. A single writer on a
  // localhost app gains nothing from WAL.
  db.exec("PRAGMA journal_mode = DELETE");
  db.exec("PRAGMA synchronous = FULL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 4000");
  db.exec(SCHEMA);
  addMissingColumns(db);
  columnsChecked = true;
  globalRef.__standupDb = db;
  seedIfEmpty(db);
  return db;
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

export function projectExists(id: string): boolean {
  return open().prepare("SELECT 1 FROM projects WHERE id = ?").get(id) !== undefined;
}

export function createProject(name: string, peopleNames: string[] = []): Project {
  const db = open();
  const id = newId("prj");
  const next = db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM projects").get() as {
    n: number;
  };
  const labelColumns = SECTION_KEYS.map(labelColumn);

  db.exec("BEGIN");
  try {
    db.prepare(
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
    const insertPerson = db.prepare(
      "INSERT INTO people (id, project_id, name, active, sort_order) VALUES (?, ?, ?, 1, ?)",
    );
    peopleNames.forEach((personName, i) => insertPerson.run(newId("psn"), id, personName, i));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

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
  const db = open();
  if (!projectExists(id)) return null;

  db.exec("BEGIN");
  try {
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

      for (const staleId of existing) {
        if (!keep.has(staleId)) db.prepare("DELETE FROM people WHERE id = ?").run(staleId);
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

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

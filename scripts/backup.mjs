#!/usr/bin/env node
/**
 * Snapshot the database to a single consistent file.
 *
 * `VACUUM INTO` is used rather than `cp` deliberately: it is safe against a live
 * database, produces one defragmented file with no -wal/-shm siblings even when the
 * source is in WAL mode, and can never catch a half-written page the way a plain copy
 * can. The result is verified before this script reports success — an unchecked backup
 * is not a backup.
 *
 *   node scripts/backup.mjs [--keep 14] [--out data/backups]
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const source = process.env.STANDUP_DB_FILE ?? path.join(process.cwd(), "data", "standup.db");
const outDir = flag("out", path.join(process.cwd(), "data", "backups"));
const keep = Number(flag("keep", "14"));

if (!fs.existsSync(source)) {
  console.error(`No database at ${source}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

// Local calendar time, matching lib/date.ts — never UTC.
const now = new Date();
const p = (n, w = 2) => String(n).padStart(w, "0");
const stamp =
  `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
  `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
const dest = path.join(outDir, `standup-${stamp}.db`);

const db = new DatabaseSync(source, { readOnly: true });
try {
  // VACUUM INTO cannot be parameterised; the path is ours, but quote it anyway.
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
} finally {
  db.close();
}

// Verify the copy, not the original. A backup that has not been opened is a guess.
const check = new DatabaseSync(dest, { readOnly: true });
try {
  const integrity = check.prepare("PRAGMA integrity_check").get();
  const ok = Object.values(integrity)[0];
  if (ok !== "ok") throw new Error(`integrity_check said: ${ok}`);
  if (check.prepare("PRAGMA foreign_key_check").all().length > 0) {
    throw new Error("foreign_key_check reported violations");
  }
  const tables = check
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);
  const counts = tables
    .map((t) => `${t} ${check.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n}`)
    .join(" · ");
  console.log(`${dest}  (${fs.statSync(dest).size} bytes)`);
  console.log(`  verified: integrity ok, no FK violations`);
  console.log(`  ${counts}`);
} catch (err) {
  fs.rmSync(dest, { force: true }); // never leave a backup that failed verification
  console.error(`Backup FAILED verification and was deleted: ${err.message}`);
  process.exit(1);
} finally {
  check.close();
}

// Prune oldest, by the sortable timestamp in the filename.
const old = fs
  .readdirSync(outDir)
  .filter((f) => /^standup-\d{4}-\d{2}-\d{2}-\d{6}\.db$/.test(f))
  .sort()
  .slice(0, -keep);
for (const f of old) {
  fs.rmSync(path.join(outDir, f));
  console.log(`  pruned ${f}`);
}

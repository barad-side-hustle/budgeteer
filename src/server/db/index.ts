import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "@/server/db/migrate";
import { getDataDir } from "@/server/lib/data-dir";

const DB_DIR = getDataDir();
const DB_PATH = path.join(DB_DIR, "budgeteer.db");

function migrateLegacyDbFile(): void {
  const legacy = path.join(DB_DIR, "spent.db");
  if (fs.existsSync(DB_PATH) || !fs.existsSync(legacy)) return;
  for (const suffix of ["", "-wal", "-shm"]) {
    const from = `${legacy}${suffix}`;
    if (fs.existsSync(from)) fs.renameSync(from, `${DB_PATH}${suffix}`);
  }
}

function createDatabase(): Database.Database {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  migrateLegacyDbFile();

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  runMigrations(db);

  return db;
}

declare global {
  var _db: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (!globalThis._db) {
    globalThis._db = createDatabase();
  }
  return globalThis._db;
}

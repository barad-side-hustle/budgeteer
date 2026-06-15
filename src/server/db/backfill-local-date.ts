import "server-only";

import type Database from "better-sqlite3";
import { toJerusalemDate } from "@/server/lib/date-utils";

export function backfillLocalDate(db: Database.Database): void {
  const rows = db
    .prepare("SELECT id, date FROM transactions WHERE local_date IS NULL")
    .all() as { id: number; date: string }[];
  if (rows.length === 0) return;

  const update = db.prepare("UPDATE transactions SET local_date = ? WHERE id = ?");
  db.transaction(() => {
    for (const row of rows) {
      update.run(toJerusalemDate(row.date), row.id);
    }
  })();
}

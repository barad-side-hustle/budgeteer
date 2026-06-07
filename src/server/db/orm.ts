import "server-only";

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getDb } from "@/server/db/index";
import * as schema from "@/server/db/schema";

declare global {
  var _orm: BetterSQLite3Database<typeof schema> | undefined;
}

export function getOrm(): BetterSQLite3Database<typeof schema> {
  if (!globalThis._orm) {
    globalThis._orm = drizzle(getDb(), { schema });
  }
  return globalThis._orm;
}

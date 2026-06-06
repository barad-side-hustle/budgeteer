import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
// The "@/" alias only maps to src/*, so the repo-root package.json stays relative.
// eslint-disable-next-line no-restricted-imports
import pkg from "../../../../package.json";

const DB_PATH = path.join(process.cwd(), "data", "budgeteer.db");

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    version: pkg.version,
    hasDb: fs.existsSync(DB_PATH),
  });
}

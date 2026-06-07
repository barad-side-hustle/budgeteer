import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const DB_PATH = path.join(process.cwd(), "data", "budgeteer.db");

export const dynamic = "force-dynamic";

function readVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function GET() {
  return NextResponse.json({
    ok: true,
    version: readVersion(),
    hasDb: fs.existsSync(DB_PATH),
  });
}

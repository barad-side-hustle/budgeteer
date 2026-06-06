import { NextResponse } from "next/server";
import { getActivitySnapshot } from "@/server/sync/activity";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getActivitySnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}

import { NextResponse } from "next/server";
import { isAccountOwnershipType, updateBankAccount } from "@/server/db/queries/bank-accounts";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

function parseAccountId(id: string): number | null {
  const accountId = Number(id);
  if (!Number.isFinite(accountId) || accountId <= 0) return null;
  return accountId;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const accountId = parseAccountId(id);
  if (accountId === null) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: { name?: string; ownershipType?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.name !== undefined && typeof body.name !== "string") {
    return NextResponse.json({ error: "name must be a string" }, { status: 400 });
  }
  if (body.ownershipType !== undefined && !isAccountOwnershipType(body.ownershipType)) {
    return NextResponse.json({ error: "invalid ownershipType" }, { status: 400 });
  }

  const updated = updateBankAccount(workspaceId, accountId, {
    name: body.name,
    ownershipType: body.ownershipType,
  });
  if (!updated) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

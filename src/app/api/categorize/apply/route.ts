import { NextResponse } from "next/server";
import type { CategoryKind } from "@/lib/types";
import { ensureCategory, getCategoryByName, getParentIds } from "@/server/db/queries/categories";
import { batchUpdateCategories } from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

interface ApplyBody {
  assignments: Array<{
    transactionId: number;
    categoryName: string;
    isNew: boolean;
    kind?: CategoryKind;
  }>;
  approvedNewCategoryNames: string[];
  rejectionFallbacks?: Record<string, string>;
}

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json()) as ApplyBody;
  const approved = new Set((body.approvedNewCategoryNames ?? []).map((n) => n.toLowerCase()));
  const fallbacks = body.rejectionFallbacks ?? {};

  const parentIds = getParentIds(workspaceId);

  const newCategoryCache = new Map<string, number>();
  const updates: { id: number; categoryId: number }[] = [];
  let createdCount = 0;
  let skippedCount = 0;

  for (const a of body.assignments) {
    if (a.isNew) {
      const isApproved = approved.has(a.categoryName.toLowerCase());
      if (isApproved) {
        const cached = newCategoryCache.get(a.categoryName.toLowerCase());
        if (cached != null) {
          updates.push({ id: a.transactionId, categoryId: cached });
        } else {
          const wasExisting = getCategoryByName(workspaceId, a.categoryName);
          const cat = ensureCategory(workspaceId, a.categoryName, undefined, a.kind ?? "expense");
          if (!wasExisting) createdCount++;
          newCategoryCache.set(a.categoryName.toLowerCase(), cat.id);
          updates.push({ id: a.transactionId, categoryId: cat.id });
        }
      } else {
        const fallbackName = fallbacks[a.categoryName];
        if (fallbackName) {
          const fallbackCat = getCategoryByName(workspaceId, fallbackName);
          if (fallbackCat && !parentIds.has(fallbackCat.id)) {
            updates.push({
              id: a.transactionId,
              categoryId: fallbackCat.id,
            });
          } else {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      }
    } else {
      const cat = getCategoryByName(workspaceId, a.categoryName);
      if (cat && !parentIds.has(cat.id)) {
        updates.push({ id: a.transactionId, categoryId: cat.id });
      } else {
        skippedCount++;
      }
    }
  }

  batchUpdateCategories(workspaceId, updates);

  return NextResponse.json({
    appliedCount: updates.length,
    createdCategoriesCount: createdCount,
    skippedCount,
  });
}

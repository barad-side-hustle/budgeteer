import type {
  Forecast,
  Recommendation,
  RecommendationTone,
  RecommendationType,
  RecurringCharge,
  SavingsOpportunity,
} from "@/lib/types";

const ESSENTIAL_CATEGORIES = new Set([
  "Bills & Utilities",
  "Insurance",
  "Health",
  "Education",
  "Kids & Childcare",
]);

const SUBSCRIPTION_CATEGORIES = new Set(["Subscriptions", "Entertainment"]);

const SUBSCRIPTION_AMOUNT_CAP = 250;
const SPIKE_RATIO = 1.3;
const SPIKE_MIN_ABS = 200;
const TRIM_FRACTION = 0.15;
const FEES_MIN = 20;

export interface CategorySpendRow {
  categoryId: number;
  name: string;
  current: number;
  typical: number;
}

export interface SavingsInput {
  recurring: RecurringCharge[];
  categorySpend: CategorySpendRow[];
  feesThisMonth: number;
  feesCategoryId: number | null;
}

function isSubscriptionCandidate(r: RecurringCharge): boolean {
  if (r.lapsed) return false;
  if (r.categoryName != null) return SUBSCRIPTION_CATEGORIES.has(r.categoryName);
  return r.amount <= SUBSCRIPTION_AMOUNT_CAP;
}

export function buildSavings(input: SavingsInput): SavingsOpportunity[] {
  const out: SavingsOpportunity[] = [];
  const spentCategoryIds = new Set<number>();

  for (const r of input.recurring) {
    if (!isSubscriptionCandidate(r)) continue;
    out.push({
      id: `sub-${r.merchant}`,
      type: "subscription",
      estimatedMonthly: r.amount,
      merchant: r.merchant,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      fraction: null,
    });
  }

  for (const c of input.categorySpend) {
    if (c.typical <= 0) continue;
    const excess = c.current - c.typical;
    if (c.current >= c.typical * SPIKE_RATIO && excess >= SPIKE_MIN_ABS) {
      out.push({
        id: `spike-${c.categoryId}`,
        type: "category-spike",
        estimatedMonthly: excess,
        merchant: null,
        categoryId: c.categoryId,
        categoryName: c.name,
        fraction: null,
      });
      spentCategoryIds.add(c.categoryId);
    }
  }

  const trimmable = input.categorySpend
    .filter(
      (c) =>
        c.typical > 0 &&
        !ESSENTIAL_CATEGORIES.has(c.name) &&
        c.categoryId !== input.feesCategoryId &&
        !spentCategoryIds.has(c.categoryId),
    )
    .sort((a, b) => b.typical - a.typical)
    .slice(0, 2);
  for (const c of trimmable) {
    out.push({
      id: `trim-${c.categoryId}`,
      type: "trim-category",
      estimatedMonthly: c.typical * TRIM_FRACTION,
      merchant: null,
      categoryId: c.categoryId,
      categoryName: c.name,
      fraction: TRIM_FRACTION,
    });
  }

  if (input.feesThisMonth >= FEES_MIN) {
    out.push({
      id: "fees",
      type: "fees",
      estimatedMonthly: input.feesThisMonth,
      merchant: null,
      categoryId: input.feesCategoryId,
      categoryName: null,
      fraction: null,
    });
  }

  out.sort((a, b) => b.estimatedMonthly - a.estimatedMonthly);
  return out;
}

export interface RecommendationInput {
  forecast: Forecast;
  savings: SavingsOpportunity[];
  hasBalance: boolean;
}

const TONE: Record<RecommendationType, RecommendationTone> = {
  "overdraft-risk": "act",
  "minus-month": "watch",
  "tight-month": "watch",
  "plus-month": "celebrate",
  "safe-to-spend": "encourage",
  "cut-subscription": "act",
  "category-spike": "watch",
  "trim-category": "encourage",
  fees: "act",
  "build-savings": "celebrate",
  "add-balance": "encourage",
};

const MAX_RECOMMENDATIONS = 6;

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const { forecast, savings } = input;
  const recs: Recommendation[] = [];
  const add = (
    type: RecommendationType,
    fields: Partial<
      Pick<Recommendation, "amount" | "amount2" | "categoryName" | "merchant" | "href">
    >,
    idSuffix = "",
  ) => {
    recs.push({
      id: `${type}${idSuffix}`,
      type,
      tone: TONE[type],
      amount: fields.amount ?? null,
      amount2: fields.amount2 ?? null,
      categoryName: fields.categoryName ?? null,
      merchant: fields.merchant ?? null,
      href: fields.href ?? null,
    });
  };

  if (forecast.hasBalance && forecast.overdraftRisk === "high") {
    add("overdraft-risk", { amount: forecast.expectedMonthEnd, href: "/transactions" });
  }

  if (forecast.verdict === "minus") {
    add("minus-month", {
      amount: forecast.projectedNet,
      amount2: forecast.safeToSpendPerDay,
      href: "/insights",
    });
  } else if (forecast.verdict === "tight") {
    add("tight-month", { amount: forecast.projectedNet, amount2: forecast.safeToSpendPerDay });
  }

  for (const s of savings.slice(0, 3)) {
    if (s.type === "subscription") {
      add(
        "cut-subscription",
        { amount: s.estimatedMonthly, merchant: s.merchant },
        `-${s.merchant}`,
      );
    } else if (s.type === "category-spike") {
      add(
        "category-spike",
        { amount: s.estimatedMonthly, categoryName: s.categoryName },
        `-${s.categoryId}`,
      );
    } else if (s.type === "fees") {
      add("fees", { amount: s.estimatedMonthly, href: "/transactions" });
    } else {
      add(
        "trim-category",
        { amount: s.estimatedMonthly, categoryName: s.categoryName },
        `-${s.categoryId}`,
      );
    }
  }

  if (forecast.safeToSpendRemaining > 0 && forecast.daysLeft > 0) {
    add("safe-to-spend", {
      amount: forecast.safeToSpendPerDay,
      amount2: forecast.safeToSpendThisWeek,
    });
  }

  if (forecast.verdict === "plus" && forecast.projectedNet > 0) {
    add("plus-month", { amount: forecast.projectedNet });
    add("build-savings", { amount: forecast.projectedNet });
  }

  if (!input.hasBalance) {
    add("add-balance", { href: "/settings/general" });
  }

  const priority: RecommendationType[] = [
    "overdraft-risk",
    "minus-month",
    "tight-month",
    "category-spike",
    "cut-subscription",
    "fees",
    "trim-category",
    "safe-to-spend",
    "plus-month",
    "build-savings",
    "add-balance",
  ];
  recs.sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));
  return recs.slice(0, MAX_RECOMMENDATIONS);
}

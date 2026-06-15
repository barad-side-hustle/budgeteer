import type { BreakdownItem, Mover, SpendInsight, Verdict, VerdictStatus } from "@/lib/types";
import { toJerusalemDate } from "@/server/lib/date-utils";

export interface CategoryMeta {
  id: number;
  parentId: number | null;
  name: string;
  color: string;
  icon: string | null;
}

export interface CategorySpend {
  categoryId: number;
  amount: number;
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface MonthRanges {
  current: { from: string; to: string };
  priorFull: { from: string; to: string };
  priorMtd: { from: string; to: string };
  elapsedDays: number;
  totalDays: number;
  monthLabel: string;
}

export function computeMonthRanges(now: Date): MonthRanges {
  const todayLocal = toJerusalemDate(now.toISOString());
  const [year, monthOneBased, day] = todayLocal.split("-").map(Number);
  const month = monthOneBased - 1;

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const totalDays = monthEnd.getDate();
  const elapsedDays = Math.min(day, totalDays);

  const prevStart = new Date(year, month - 1, 1);
  const prevEnd = new Date(year, month, 0);
  const prevTotalDays = prevEnd.getDate();
  const prevMtdDay = Math.min(elapsedDays, prevTotalDays);
  const prevMtdEnd = new Date(prevStart.getFullYear(), prevStart.getMonth(), prevMtdDay);

  return {
    current: { from: iso(monthStart), to: iso(monthEnd) },
    priorFull: { from: iso(prevStart), to: iso(prevEnd) },
    priorMtd: { from: iso(prevStart), to: iso(prevMtdEnd) },
    elapsedDays,
    totalDays,
    monthLabel: monthStart.toLocaleDateString("en-US", { month: "long" }),
  };
}

interface VerdictInput {
  spentMtd: number;
  priorMtd: number;
  elapsedDays: number;
  totalDays: number;
  daysUntilPayday: number;
  monthLabel: string;
  typicalMonthly: number | null;
  monthlyTarget: number | null;
}

const PACE_BAND_PERCENT = 10;

export function computeVerdict(input: VerdictInput): Verdict {
  const { spentMtd, priorMtd, elapsedDays, totalDays, typicalMonthly, monthlyTarget } = input;
  const projected = elapsedDays > 0 ? (spentMtd / elapsedDays) * totalDays : spentMtd;
  const deltaAmount = spentMtd - priorMtd;
  const deltaPercent = priorMtd > 0 ? (deltaAmount / priorMtd) * 100 : null;

  let projectedStatus: VerdictStatus = "on-track";
  let vsTypicalPercent: number | null = null;
  if (typicalMonthly != null && typicalMonthly > 0) {
    vsTypicalPercent = (projected / typicalMonthly - 1) * 100;
    if (vsTypicalPercent > PACE_BAND_PERCENT) projectedStatus = "over";
    else if (vsTypicalPercent < -PACE_BAND_PERCENT) projectedStatus = "under";
  }

  return {
    spent: spentMtd,
    projected,
    monthLabel: input.monthLabel,
    elapsedDays,
    totalDays,
    daysUntilPayday: input.daysUntilPayday,
    priorMtd,
    deltaAmount,
    deltaPercent,
    typicalMonthly,
    vsTypicalPercent,
    projectedStatus,
    monthlyTarget,
    remaining: monthlyTarget != null ? monthlyTarget - spentMtd : null,
  };
}

export function rollUpByParent(
  spend: CategorySpend[],
  metaById: Map<number, CategoryMeta>,
): Map<number, number> {
  const rolled = new Map<number, number>();
  for (const row of spend) {
    const cat = metaById.get(row.categoryId);
    if (!cat) continue;
    const key = cat.parentId ?? cat.id;
    rolled.set(key, (rolled.get(key) ?? 0) + row.amount);
  }
  return rolled;
}

interface MoversInput {
  current: Map<number, number>;
  prior: Map<number, number>;
  metaById: Map<number, CategoryMeta>;
  topMerchantByKey: Map<number, string>;
  trendByKey: Map<number, number[]>;
  limit?: number;
}

const MOVER_MIN_ABS = 150;
const MOVER_MIN_FRACTION = 0.15;

export function computeMovers(input: MoversInput): Mover[] {
  const { current, prior, metaById, topMerchantByKey, trendByKey } = input;
  const limit = input.limit ?? 5;
  const keys = new Set<number>([...current.keys(), ...prior.keys()]);
  const movers: Mover[] = [];

  for (const key of keys) {
    const cat = metaById.get(key);
    if (!cat) continue;
    const cur = current.get(key) ?? 0;
    const pri = prior.get(key) ?? 0;
    const delta = cur - pri;
    const threshold = Math.max(MOVER_MIN_ABS, pri * MOVER_MIN_FRACTION);
    if (Math.abs(delta) < threshold) continue;
    movers.push({
      categoryId: key,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      current: cur,
      prior: pri,
      deltaAmount: delta,
      deltaPercent: pri > 0 ? (delta / pri) * 100 : null,
      direction: delta >= 0 ? "up" : "down",
      topMerchant: topMerchantByKey.get(key) ?? null,
      trend: trendByKey.get(key) ?? [],
    });
  }

  movers.sort((a, b) => Math.abs(b.deltaAmount) - Math.abs(a.deltaAmount));
  return movers.slice(0, limit);
}

export function computeBreakdown(
  current: Map<number, number>,
  prior: Map<number, number>,
  metaById: Map<number, CategoryMeta>,
): BreakdownItem[] {
  let total = 0;
  for (const v of current.values()) total += v;

  const items: BreakdownItem[] = [];
  for (const [key, amount] of current) {
    const cat = metaById.get(key);
    if (!cat || amount <= 0) continue;
    const pri = prior.get(key) ?? 0;
    items.push({
      categoryId: key,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      amount,
      percentOfTotal: total > 0 ? (amount / total) * 100 : 0,
      deltaPercent: pri > 0 ? (amount / pri - 1) * 100 : null,
    });
  }

  items.sort((a, b) => b.amount - a.amount);
  return items;
}

interface InsightsInput {
  movers: Mover[];
  current: Map<number, number>;
  typicalByKey: Map<number, number>;
  metaById: Map<number, CategoryMeta>;
  limit?: number;
}

const ANOMALY_MIN_RATIO = 1.5;
const ANOMALY_MIN_ABS = 200;

export function buildInsights(input: InsightsInput): SpendInsight[] {
  const { movers, current, typicalByKey, metaById } = input;
  const limit = input.limit ?? 4;
  const insights: SpendInsight[] = [];
  const used = new Set<number>();

  const topUp = movers.find((m) => m.direction === "up");
  if (topUp) {
    used.add(topUp.categoryId);
    insights.push({
      id: `increase-${topUp.categoryId}`,
      type: "biggest-increase",
      tone: "warning",
      categoryId: topUp.categoryId,
      categoryName: topUp.name,
      amount: topUp.deltaAmount,
      percent: topUp.deltaPercent,
      merchant: topUp.topMerchant,
    });
  }

  const topDown = movers.find((m) => m.direction === "down");
  if (topDown) {
    used.add(topDown.categoryId);
    insights.push({
      id: `saving-${topDown.categoryId}`,
      type: "biggest-saving",
      tone: "positive",
      categoryId: topDown.categoryId,
      categoryName: topDown.name,
      amount: Math.abs(topDown.deltaAmount),
      percent: topDown.deltaPercent,
      merchant: null,
    });
  }

  let bestAnomaly: { key: number; excess: number; ratio: number } | null = null;
  for (const [key, amount] of current) {
    if (used.has(key)) continue;
    const typical = typicalByKey.get(key);
    if (typical == null || typical <= 0) continue;
    const excess = amount - typical;
    const ratio = amount / typical;
    if (ratio >= ANOMALY_MIN_RATIO && excess >= ANOMALY_MIN_ABS) {
      if (!bestAnomaly || excess > bestAnomaly.excess) bestAnomaly = { key, excess, ratio };
    }
  }
  if (bestAnomaly) {
    const cat = metaById.get(bestAnomaly.key);
    if (cat) {
      used.add(bestAnomaly.key);
      insights.push({
        id: `anomaly-${bestAnomaly.key}`,
        type: "anomaly",
        tone: "warning",
        categoryId: bestAnomaly.key,
        categoryName: cat.name,
        amount: bestAnomaly.excess,
        percent: (bestAnomaly.ratio - 1) * 100,
        merchant: null,
      });
    }
  }

  return insights.slice(0, limit);
}

export function cumulative(series: number[]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const v of series) {
    sum += v;
    out.push(sum);
  }
  return out;
}

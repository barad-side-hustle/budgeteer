import type { Anomaly, AnomalyType } from "@/lib/types";

export interface AnomalyTxn {
  id: number;
  date: string;
  monthKey: string;
  merchant: string;
  displayMerchant: string;
  description: string;
  amount: number;
  originalCurrency: string;
  categoryId: number | null;
  categoryName: string | null;
}

export interface DetectAnomaliesInput {
  txns: AnomalyTxn[];
  currentMonthKey: string;
  homeCurrency: string;
  feesCategoryName: string | null;
}

const DUP_WINDOW_DAYS = 3;
const DUP_MIN_AMOUNT = 30;
const FOREIGN_MIN_AMOUNT = 75;
const OUTLIER_RATIO = 2.5;
const OUTLIER_MIN_HISTORY = 3;
const OUTLIER_MIN_AMOUNT = 100;
const CREEP_MIN_MONTHS = 4;
const CREEP_MIN_PERCENT = 10;
const CREEP_MIN_ABS = 10;
const CREEP_MAX_PER_MONTH = 1.5;
const CREEP_PRIOR_STABILITY = 1.25;
const NEWSUB_RECENT_MONTHS = 2;
const NEWSUB_MAX_SPREAD = 1.5;
const FEE_SPIKE_RATIO = 1.5;
const FEE_SPIKE_MIN_ABS = 30;
const MAX_PER_TYPE = 3;
const MAX_TOTAL = 8;

const INTEREST_PATTERNS: readonly RegExp[] = [
  /ריבית/i,
  /עמלת?\s*יתר/i,
  /משיכת\s*יתר/i,
  /\boverdraft\b/i,
  /\binterest\b/i,
];

function dayNumber(date: string): number {
  const ms = Date.parse(date.slice(0, 10));
  return Number.isNaN(ms) ? Number.NaN : Math.floor(ms / 86_400_000);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function matchesInterest(description: string): boolean {
  const normalized = description.replace(/\s+/g, " ").trim();
  return normalized.length > 0 && INTEREST_PATTERNS.some((p) => p.test(normalized));
}

function groupByMerchant(txns: AnomalyTxn[]): Map<string, AnomalyTxn[]> {
  const map = new Map<string, AnomalyTxn[]>();
  for (const t of txns) {
    const list = map.get(t.merchant);
    if (list) list.push(t);
    else map.set(t.merchant, [t]);
  }
  return map;
}

function detectDuplicates(current: AnomalyTxn[], usedTxnIds: Set<number>): Anomaly[] {
  const out: Anomaly[] = [];
  for (const [, group] of groupByMerchant(current)) {
    const sorted = [...group].sort((a, b) => dayNumber(a.date) - dayNumber(b.date));
    const paired = new Set<number>();
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      if (paired.has(a.id) || a.amount < DUP_MIN_AMOUNT) continue;
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        if (paired.has(b.id)) continue;
        const gap = Math.abs(dayNumber(a.date) - dayNumber(b.date));
        if (gap > DUP_WINDOW_DAYS) break;
        if (Math.abs(a.amount - b.amount) < 0.01) {
          paired.add(a.id);
          paired.add(b.id);
          usedTxnIds.add(a.id);
          usedTxnIds.add(b.id);
          out.push({
            id: `dup-${a.id}-${b.id}`,
            type: "duplicate-charge",
            severity: "flag",
            merchant: a.displayMerchant,
            categoryName: a.categoryName,
            amount: a.amount,
            amount2: null,
            percent: null,
            currency: a.originalCurrency,
            occurredAt: b.date,
            transactionIds: [a.id, b.id],
          });
          break;
        }
      }
    }
  }
  return out;
}

const HOME_CURRENCY_ALIASES = new Set(["ILS", "NIS", "₪", "שח", 'ש"ח', "ש''ח", "שקל"]);

function isHomeCurrency(currency: string, homeCurrency: string): boolean {
  const normalized = currency.trim().toUpperCase();
  if (normalized === "") return true;
  return normalized === homeCurrency.trim().toUpperCase() || HOME_CURRENCY_ALIASES.has(normalized);
}

function detectForeign(
  current: AnomalyTxn[],
  priorMerchants: Set<string>,
  homeCurrency: string,
  usedTxnIds: Set<number>,
): Anomaly[] {
  const byMerchant = new Map<string, AnomalyTxn>();
  for (const t of current) {
    if (usedTxnIds.has(t.id)) continue;
    if (t.amount < FOREIGN_MIN_AMOUNT) continue;
    if (isHomeCurrency(t.originalCurrency, homeCurrency)) continue;
    if (priorMerchants.has(t.merchant)) continue;
    const existing = byMerchant.get(t.merchant);
    if (!existing || t.amount > existing.amount) byMerchant.set(t.merchant, t);
  }
  const out: Anomaly[] = [];
  for (const t of byMerchant.values()) {
    usedTxnIds.add(t.id);
    out.push({
      id: `foreign-${t.id}`,
      type: "foreign-charge",
      severity: "flag",
      merchant: t.displayMerchant,
      categoryName: t.categoryName,
      amount: t.amount,
      amount2: null,
      percent: null,
      currency: t.originalCurrency,
      occurredAt: t.date,
      transactionIds: [t.id],
    });
  }
  return out;
}

function detectOutliers(
  current: AnomalyTxn[],
  priorByMerchant: Map<string, AnomalyTxn[]>,
  usedTxnIds: Set<number>,
  outlierMerchants: Set<string>,
): Anomaly[] {
  const byMerchant = new Map<string, { txn: AnomalyTxn; typical: number }>();
  for (const t of current) {
    if (usedTxnIds.has(t.id)) continue;
    const prior = priorByMerchant.get(t.merchant);
    if (!prior || prior.length < OUTLIER_MIN_HISTORY) continue;
    const typical = median(prior.map((p) => p.amount));
    if (typical <= 0) continue;
    if (t.amount < typical * OUTLIER_RATIO || t.amount - typical < OUTLIER_MIN_AMOUNT) continue;
    const existing = byMerchant.get(t.merchant);
    if (!existing || t.amount > existing.txn.amount)
      byMerchant.set(t.merchant, { txn: t, typical });
  }
  const out: Anomaly[] = [];
  for (const { txn, typical } of byMerchant.values()) {
    usedTxnIds.add(txn.id);
    outlierMerchants.add(txn.merchant);
    out.push({
      id: `outlier-${txn.id}`,
      type: "merchant-outlier",
      severity: "flag",
      merchant: txn.displayMerchant,
      categoryName: txn.categoryName,
      amount: txn.amount,
      amount2: typical,
      percent: (txn.amount / typical - 1) * 100,
      currency: txn.originalCurrency,
      occurredAt: txn.date,
      transactionIds: [txn.id],
    });
  }
  return out;
}

function monthlyRepresentatives(txns: AnomalyTxn[]): Map<string, number> {
  const byMonth = new Map<string, number[]>();
  for (const t of txns) {
    const list = byMonth.get(t.monthKey);
    if (list) list.push(t.amount);
    else byMonth.set(t.monthKey, [t.amount]);
  }
  const reps = new Map<string, number>();
  for (const [month, amounts] of byMonth) reps.set(month, median(amounts));
  return reps;
}

function detectPriceCreep(
  allByMerchant: Map<string, AnomalyTxn[]>,
  currentMonthKey: string,
  outlierMerchants: Set<string>,
  usedMerchants: Set<string>,
): Anomaly[] {
  const out: Anomaly[] = [];
  for (const [merchant, group] of allByMerchant) {
    if (outlierMerchants.has(merchant) || usedMerchants.has(merchant)) continue;
    const reps = monthlyRepresentatives(group);
    if (reps.size < CREEP_MIN_MONTHS) continue;
    const recent = reps.get(currentMonthKey);
    if (recent == null) continue;
    const priorTxns = group.filter((t) => t.monthKey !== currentMonthKey);
    const priorMonths = new Set(priorTxns.map((t) => t.monthKey));
    if (priorMonths.size === 0) continue;
    if (priorTxns.length / priorMonths.size > CREEP_MAX_PER_MONTH) continue;
    const priorReps: number[] = [];
    for (const [month, value] of reps) {
      if (month !== currentMonthKey) priorReps.push(value);
    }
    const minPrior = Math.min(...priorReps);
    const maxPrior = Math.max(...priorReps);
    if (minPrior <= 0 || maxPrior / minPrior > CREEP_PRIOR_STABILITY) continue;
    const typical = median(priorReps);
    if (typical <= 0) continue;
    const percent = (recent / typical - 1) * 100;
    if (percent < CREEP_MIN_PERCENT || recent - typical < CREEP_MIN_ABS) continue;
    usedMerchants.add(merchant);
    const sample = group.find((t) => t.monthKey === currentMonthKey) ?? group[group.length - 1];
    out.push({
      id: `creep-${merchant}`,
      type: "price-creep",
      severity: "watch",
      merchant: sample.displayMerchant,
      categoryName: sample.categoryName,
      amount: recent,
      amount2: typical,
      percent,
      currency: sample.originalCurrency,
      occurredAt: null,
      transactionIds: [],
    });
  }
  return out;
}

function detectNewSubscriptions(
  allByMerchant: Map<string, AnomalyTxn[]>,
  monthKeys: string[],
  currentMonthKey: string,
  usedMerchants: Set<string>,
): Anomaly[] {
  const recentCutoff = monthKeys[Math.max(0, monthKeys.length - NEWSUB_RECENT_MONTHS)];
  const out: Anomaly[] = [];
  for (const [merchant, group] of allByMerchant) {
    if (usedMerchants.has(merchant)) continue;
    const months = new Set(group.map((t) => t.monthKey));
    if (months.size < 2) continue;
    if (!months.has(currentMonthKey)) continue;
    const firstSeen = [...group].sort((a, b) => a.monthKey.localeCompare(b.monthKey))[0].monthKey;
    if (firstSeen < recentCutoff) continue;
    const amounts = group.map((t) => t.amount);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    if (min <= 0 || max / min > NEWSUB_MAX_SPREAD) continue;
    usedMerchants.add(merchant);
    out.push({
      id: `newsub-${merchant}`,
      type: "new-subscription",
      severity: "watch",
      merchant: group[0].displayMerchant,
      categoryName: group[0].categoryName,
      amount: median(amounts),
      amount2: null,
      percent: null,
      currency: group[0].originalCurrency,
      occurredAt: null,
      transactionIds: [],
    });
  }
  return out;
}

function detectInterest(current: AnomalyTxn[]): Anomaly[] {
  const matches = current.filter((t) => matchesInterest(t.description));
  if (matches.length === 0) return [];
  const total = matches.reduce((sum, t) => sum + t.amount, 0);
  if (total <= 0) return [];
  return [
    {
      id: "interest",
      type: "interest-charge",
      severity: "watch",
      merchant: null,
      categoryName: null,
      amount: total,
      amount2: null,
      percent: null,
      currency: matches[0].originalCurrency,
      occurredAt: null,
      transactionIds: matches.map((t) => t.id),
    },
  ];
}

function detectFeeSpike(
  txns: AnomalyTxn[],
  currentMonthKey: string,
  feesCategoryName: string | null,
): Anomaly[] {
  if (!feesCategoryName) return [];
  const feeTxns = txns.filter((t) => t.categoryName === feesCategoryName);
  if (feeTxns.length === 0) return [];
  const byMonth = new Map<string, number>();
  for (const t of feeTxns) byMonth.set(t.monthKey, (byMonth.get(t.monthKey) ?? 0) + t.amount);
  const current = byMonth.get(currentMonthKey) ?? 0;
  if (current <= 0) return [];
  const prior: number[] = [];
  for (const [month, total] of byMonth) {
    if (month !== currentMonthKey) prior.push(total);
  }
  const typical = median(prior);
  if (typical <= 0) return [];
  if (current < typical * FEE_SPIKE_RATIO || current - typical < FEE_SPIKE_MIN_ABS) return [];
  return [
    {
      id: "fee-spike",
      type: "fee-spike",
      severity: "watch",
      merchant: null,
      categoryName: feesCategoryName,
      amount: current,
      amount2: typical,
      percent: (current / typical - 1) * 100,
      currency: null,
      occurredAt: null,
      transactionIds: [],
    },
  ];
}

function capByType(anomalies: Anomaly[]): Anomaly[] {
  const counts = new Map<AnomalyType, number>();
  const out: Anomaly[] = [];
  for (const a of anomalies) {
    const n = counts.get(a.type) ?? 0;
    if (n >= MAX_PER_TYPE) continue;
    counts.set(a.type, n + 1);
    out.push(a);
  }
  return out;
}

export function detectAnomalies(input: DetectAnomaliesInput): Anomaly[] {
  const { txns, currentMonthKey, homeCurrency, feesCategoryName } = input;
  const current = txns.filter((t) => t.monthKey === currentMonthKey);
  const prior = txns.filter((t) => t.monthKey !== currentMonthKey);
  const monthKeys = [...new Set(txns.map((t) => t.monthKey))].sort();

  const priorByMerchant = groupByMerchant(prior);
  const allByMerchant = groupByMerchant(txns);
  const priorMerchants = new Set(priorByMerchant.keys());

  const usedTxnIds = new Set<number>();
  const outlierMerchants = new Set<string>();
  const usedMerchants = new Set<string>();

  const flags = capByType(
    [
      ...detectDuplicates(current, usedTxnIds),
      ...detectForeign(current, priorMerchants, homeCurrency, usedTxnIds),
      ...detectOutliers(current, priorByMerchant, usedTxnIds, outlierMerchants),
    ].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
  );

  const watches = capByType(
    [
      ...detectPriceCreep(allByMerchant, currentMonthKey, outlierMerchants, usedMerchants),
      ...detectNewSubscriptions(allByMerchant, monthKeys, currentMonthKey, usedMerchants),
      ...detectInterest(current),
      ...detectFeeSpike(txns, currentMonthKey, feesCategoryName),
    ].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
  );

  return [...flags, ...watches].slice(0, MAX_TOTAL);
}

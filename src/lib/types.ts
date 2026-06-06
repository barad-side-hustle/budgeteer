export interface Workspace {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  workspaceId: number;
  title: string;
  titleSource: "auto" | "manual";
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: number;
  accountNumber: string;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  description: string;
  memo: string | null;
  type: "normal" | "installments";
  status: "completed" | "pending";
  identifier: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  categoryId: number | null;
  categorySource: "ai" | "user" | null;
  aiConfidence: number | null;
  provider: string;
  credentialId: number | null;
  accountLabel: string | null;
  /** Friendly per-account name from bank_accounts, when one exists. */
  accountName: string | null;
  syncRunId: number;
  kind: "expense" | "income" | "transfer";
  needsReview: boolean;
  /** Set when this row is the grouping leg of a financial event. */
  eventId: number | null;
  eventRole: EventRole | null;
  matchConfidence: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionWithCategory extends Transaction {
  categoryName: string | null;
  categoryColor: string | null;
  isExcluded: boolean;
}

// ---------------------------------------------------------------------------
// Financial Events: the cross-account deduplication layer. The same real-world
// money movement (a transfer, a credit card bill payment, an ATM withdrawal)
// shows up as N transaction rows once several accounts are aggregated; an event
// groups those rows so spend is counted exactly once. See
// docs/transaction-deduplication-design.md.
// ---------------------------------------------------------------------------

export type EventType =
  | "internal_transfer"
  | "credit_card_payment"
  | "credit_card_statement"
  | "atm_withdrawal"
  | "loan_repayment"
  | "investment_transfer"
  | "refund_reversal"
  | "fee"
  | "duplicate";

export type EventRole = "debit" | "credit" | "bill_payment" | "purchase" | "fee" | "reversal";

export type EventStatus = "suggested" | "confirmed" | "rejected";

export type EventSource = "heuristic" | "rule" | "user" | "ai";

export interface FinancialEvent {
  id: number;
  workspaceId: number;
  eventType: EventType;
  canonicalTransactionId: number | null;
  status: EventStatus;
  source: EventSource;
  confidence: number;
  reasons: string[];
  eventKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventMember {
  id: number;
  workspaceId: number;
  eventId: number;
  transactionId: number;
  role: EventRole;
  priorKind: Transaction["kind"] | null;
  matchConfidence: number | null;
  createdAt: string;
}

/** A financial event plus the transaction rows it groups, for review and display. */
export interface FinancialEventWithMembers extends FinancialEvent {
  members: (EventMember & {
    description: string;
    date: string;
    chargedAmount: number;
    chargedCurrency: string | null;
    provider: string;
    accountLabel: string | null;
  })[];
}

export interface MatchSettings {
  eventType: EventType;
  epsilon: number;
  dayWindow: number;
  minScore: number;
  autoScore: number;
  requireKeyword: boolean;
  enabled: boolean;
}

export type CategoryKind = "expense" | "income";

export type BudgetMode = "budgeted" | "tracking";

export interface Category {
  id: number;
  parentId: number | null;
  name: string;
  color: string;
  icon: string | null;
  kind: CategoryKind;
  budgetMode: BudgetMode;
  description: string | null;
}

export type CategoryViewMode = "collapsed" | "expanded";

export type BudgetSource = "own" | "rollup" | "leaf";

export interface SyncRun {
  id: number;
  provider: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  errorMessage: string | null;
  transactionsAdded: number;
  transactionsUpdated: number;
  scrapeFromDate: string;
  createdAt: string;
}

export interface MonthlySummary {
  month: string;
  amount: number;
}

export interface MerchantSummary {
  name: string;
  amount: number;
  count: number;
}

export interface CategoryBreakdown {
  categoryId: number;
  name: string;
  color: string;
  amount: number;
  count: number;
}

export type BudgetStatus = "plenty-left" | "on-track" | "heads-up" | "over";

export interface CategoryWithData {
  categoryId: number;
  parentId: number | null;
  parentName: string | null;
  isParent: boolean;
  budgetSource: BudgetSource;
  childCount?: number;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string | null;
  budgetMode: BudgetMode;
  spent: number;
  transactionCount: number;
  topMerchant: string | null;
  budget: number;
  isAutoBudget: boolean;
  vsLastMonth: number | null;
  remaining: number;
  perDayRemaining: number | null;
  percentSpent: number;
  status: BudgetStatus;
  needsReviewCount: number;
  vsTypical: { typical: number; percentDiff: number } | null;
}

export interface DashboardSummary {
  periodTotal: number;
  transactionCount: number;
  monthlySpend: MonthlySummary[];
  topMerchants: MerchantSummary[];
  categoryBreakdown: CategoryBreakdown[];
  categoriesWithData: CategoryWithData[];
  totalBudget: number;
  budgetedSpent: number;
  overallPercentSpent: number;
  timeElapsedPercent: number;
  daysUntilPayday: number;
  paydayDay: number;
  todayLabel: string;
  monthLabel: string;
  typicalMonthly: number | null;
}

export interface Budget {
  categoryId: number;
  monthlyAmount: number;
  isAuto: boolean;
}

export interface HomeCashFlow {
  income: number;
  expenses: number;
  net: number;
}

export interface HomeHistoricalTrendPoint {
  month: string;
  label: string;
  total: number;
  isCurrent: boolean;
}

export interface HomeRecentTransaction {
  id: number;
  date: string;
  description: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  kind: "expense" | "income" | "transfer";
  categoryName: string | null;
  categoryColor: string | null;
}

export interface HomeNeedsAttention {
  uncategorized: number;
  lowConfidence: number;
  flagged: number;
}

export interface HomeBankHealthItem {
  provider: string;
  providerName: string;
  lastSyncAt: string | null;
  status: "ok" | "stale" | "error" | "never";
  errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// Insights: the single payload behind the redesigned Home. Every field exists
// to answer one of the five questions: what did I spend on, what changed vs
// last month, why, is it good or bad, what can I improve. All numbers are
// computed deterministically server-side (see src/server/insights/).
// ---------------------------------------------------------------------------

/** How the month is projected to end relative to the user's own typical spend. */
export type VerdictStatus = "under" | "on-track" | "over";

export interface Verdict {
  /** Spend so far this month (month-to-date). */
  spent: number;
  /** Straight-line projection of month-end spend from the current pace. */
  projected: number;
  monthLabel: string;
  elapsedDays: number;
  totalDays: number;
  daysUntilPayday: number;
  /** Spend over the same number of days last month (like-for-like). */
  priorMtd: number;
  /** spent - priorMtd (signed; positive means spending more than last month). */
  deltaAmount: number;
  /** Percent change vs the same window last month, or null when no baseline. */
  deltaPercent: number | null;
  /** Trailing 3-month average monthly spend, the honest baseline. */
  typicalMonthly: number | null;
  /** projected vs typicalMonthly, as a percent (signed), or null. */
  vsTypicalPercent: number | null;
  /** Verdict on the projected month-end vs the user's typical spend. */
  projectedStatus: VerdictStatus;
  /** Optional explicit monthly target the user set in Settings. */
  monthlyTarget: number | null;
  /** monthlyTarget - spent when a target exists, else null. */
  remaining: number | null;
}

/** A category whose spend changed the most vs last month (ranked by magnitude). */
export interface Mover {
  categoryId: number;
  name: string;
  color: string;
  icon: string | null;
  /** Spend this month (month-to-date). */
  current: number;
  /** Spend across the whole prior month. */
  prior: number;
  /** current - prior (signed). */
  deltaAmount: number;
  deltaPercent: number | null;
  direction: "up" | "down";
  /** The merchant driving most of this category's spend, for the inline "why". */
  topMerchant: string | null;
  /** Monthly totals over the trailing window so the row can show creep. */
  trend: number[];
}

export interface BreakdownItem {
  categoryId: number;
  name: string;
  color: string;
  icon: string | null;
  amount: number;
  percentOfTotal: number;
  /** Percent change vs the whole prior month, or null. */
  deltaPercent: number | null;
}

export type InsightType =
  | "biggest-increase"
  | "biggest-saving"
  | "anomaly"
  | "over-pace"
  | "under-pace";

export interface SpendInsight {
  id: string;
  type: InsightType;
  tone: "positive" | "warning" | "neutral";
  categoryId: number | null;
  categoryName: string | null;
  /** Primary money figure (a delta, an excess, or a projection gap). */
  amount: number | null;
  percent: number | null;
  merchant: string | null;
}

export interface BurndownPayload {
  /** Cumulative spend by day for the current month, up to today. */
  current: number[];
  /** Cumulative spend by day across the whole prior month (the baseline curve). */
  prior: number[];
  totalDays: number;
}

export type InsightSection =
  | "verdict"
  | "cashFlow"
  | "movers"
  | "breakdown"
  | "insights"
  | "trend"
  | "burndown"
  | "recentTransactions"
  | "needsAttention"
  | "bankHealth";

export interface InsightSectionError {
  section: InsightSection;
  message: string;
}

export interface InsightPayload {
  verdict: Verdict | null;
  cashFlow: HomeCashFlow | null;
  movers: Mover[] | null;
  breakdown: BreakdownItem[] | null;
  insights: SpendInsight[] | null;
  trend: HomeHistoricalTrendPoint[] | null;
  burndown: BurndownPayload | null;
  recentTransactions: HomeRecentTransaction[] | null;
  needsAttention: HomeNeedsAttention | null;
  bankHealth: HomeBankHealthItem[] | null;
  nextScheduledSync: string | null;
  errors: InsightSectionError[];
}

// ---------------------------------------------------------------------------
// Forecast: the RiseUp-style "bottom line" for the current month. Answers "will
// I finish the month in the plus or the minus", "how much is safe to spend",
// and (when a balance is known) "what will my balance be at month end". All
// computed locally and deterministically; see src/server/insights/forecast.ts.
// ---------------------------------------------------------------------------

/** plus = projected to finish positive, tight = near zero, minus = projected negative. */
export type ForecastVerdict = "plus" | "tight" | "minus";

export type OverdraftRisk = "none" | "watch" | "high";

export interface Forecast {
  monthLabel: string;
  elapsedDays: number;
  totalDays: number;
  daysLeft: number;
  daysUntilPayday: number;
  /** Income received so far this month. */
  incomeMtd: number;
  /** Spending so far this month. */
  expensesMtd: number;
  /** incomeMtd - expensesMtd. */
  netMtd: number;
  /** Expected total income for the month (counts salary not yet received). */
  expectedIncome: number;
  /** Projected total spending for the month at the current pace. */
  projectedExpenses: number;
  /** expectedIncome - projectedExpenses: the month's projected bottom line. */
  projectedNet: number;
  remainingIncome: number;
  remainingExpenses: number;
  verdict: ForecastVerdict;
  /** How much more can be spent this month while still finishing in the plus (or within target). */
  safeToSpendRemaining: number;
  safeToSpendPerDay: number;
  safeToSpendThisWeek: number;
  /** Trailing 3-month average monthly spend, the honest baseline. */
  typicalMonthlyExpenses: number | null;
  typicalMonthlyIncome: number | null;
  /** Optional explicit monthly spending target the user set. */
  monthlyTarget: number | null;
  /** Tier 2 (only when the user has set a current balance). */
  balanceToday: number | null;
  expectedMonthEnd: number | null;
  overdraftRisk: OverdraftRisk;
  /** False when there is no income/expense this month and no history: nothing to forecast yet. */
  hasData: boolean;
  /** True when a current balance is known, unlocking the month-end balance line. */
  hasBalance: boolean;
}

// ---------------------------------------------------------------------------
// Recurring charges + fixed vs variable. A merchant that bills you most months
// (rent, utilities, subscriptions, insurance) is a fixed commitment; everything
// else is discretionary. See src/server/insights/recurring.ts.
// ---------------------------------------------------------------------------

export interface RecurringCharge {
  merchant: string;
  categoryId: number | null;
  categoryName: string | null;
  /** Representative monthly amount (median of the months it appeared in). */
  amount: number;
  monthsPresent: number;
  monthsConsidered: number;
  /** True when the most recent month is missing it (may have been cancelled). */
  lapsed: boolean;
}

export interface FixedVsVariable {
  /** Sum of recurring commitments per month. */
  fixedMonthly: number;
  /** typicalMonthly - fixedMonthly (floored at 0): discretionary spend. */
  variableMonthly: number;
  typicalMonthly: number;
}

// ---------------------------------------------------------------------------
// Savings opportunities + recommendations: the behavior-change layer. Friendly,
// non-judgmental, practical actions. See src/server/insights/recommendations.ts.
// ---------------------------------------------------------------------------

export type SavingsType = "subscription" | "category-spike" | "trim-category" | "fees";

export interface SavingsOpportunity {
  id: string;
  type: SavingsType;
  /** Potential money freed up per month if acted on. */
  estimatedMonthly: number;
  merchant: string | null;
  categoryId: number | null;
  categoryName: string | null;
  /** For trim-category: the fraction suggested (e.g. 0.15). */
  fraction: number | null;
}

export type RecommendationTone = "celebrate" | "encourage" | "watch" | "act";

export type RecommendationType =
  | "overdraft-risk"
  | "minus-month"
  | "tight-month"
  | "plus-month"
  | "safe-to-spend"
  | "cut-subscription"
  | "category-spike"
  | "trim-category"
  | "fees"
  | "build-savings"
  | "add-balance";

export interface Recommendation {
  id: string;
  type: RecommendationType;
  tone: RecommendationTone;
  /** Primary money figure, raw (the UI formats it for the locale). */
  amount: number | null;
  /** Secondary figure (e.g. per-day allowance), raw. */
  amount2: number | null;
  categoryName: string | null;
  merchant: string | null;
  /** Where the card's action links, or null for an informational card. */
  href: string | null;
}

export interface ForecastPayload {
  forecast: Forecast | null;
  fixedVsVariable: FixedVsVariable | null;
  recurring: RecurringCharge[] | null;
  savings: SavingsOpportunity[] | null;
  recommendations: Recommendation[] | null;
  /** Sum of savings.estimatedMonthly. */
  totalSavings: number;
  errors: InsightSectionError[];
}

export type SyncKind = "manual" | "scheduled";

export interface ActivitySnapshot {
  sync: {
    active: boolean;
    since: string | null;
    kind: SyncKind | null;
    stale: boolean;
  };
  scheduler: {
    armed: boolean;
    nextRunAt: string | null;
  };
  ollama: {
    running: boolean;
    spawnedByBudgeteer: boolean;
  };
}

export interface Integration {
  id: number;
  provider: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string | null;
  transactionCount: number;
  /** True when the user has flagged this bank as needing manual 2FA (showBrowser fallback). */
  requiresManualTwoFactor: boolean;
  /** True when a long-term OTP token is already stored (programmatic 2FA banks only). */
  hasTwoFactorToken: boolean;
}

/** How an account is owned, set by the user. Drives the account badge/label. */
export type AccountOwnershipType = "personal" | "joint" | "shared";

/**
 * A real account exposed by a bank connection. One Integration (credential) can
 * own several of these. Pure metadata: transactions stay keyed by
 * (credentialId, accountNumber); see src/server/db/queries/bank-accounts.ts.
 */
export interface BankAccount {
  id: number;
  credentialId: number;
  /** Joined from bank_credentials for the provider badge. */
  provider: string;
  accountNumber: string;
  name: string;
  ownershipType: AccountOwnershipType;
  balance: number | null;
  balanceCurrency: string | null;
  balanceUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A BankAccount plus per-account spend aggregates for the dashboard cards. */
export interface AccountSummary extends BankAccount {
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
}

export interface SetupStatus {
  isConfigured: boolean;
  hasBankCredentials: boolean;
  hasAIProvider: boolean;
}

export interface AppSettings {
  /** The user's current account balance, the anchor for the month-end forecast. Null when not set. */
  currentBalance: number | null;
  /** ISO date the balance was accurate as of. Null when no balance is set. */
  balanceDate: string | null;
  monthsToSync: number;
  aiProvider: "claude" | "gemini" | "ollama" | "none";
  geminiModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  showBrowser: boolean;
  paydayDay: number;
  monthlyTarget: number | null;
  autoSyncEnabled: boolean;
  autoSyncTime: string;
  treatAtmAsTransfers: boolean;
}

export type BankProvider =
  | "isracard"
  | "cal"
  | "max"
  | "amex"
  | "hapoalim"
  | "leumi"
  | "mizrahi"
  | "discount"
  | "mercantile"
  | "beinleumi"
  | "otsarHahayal"
  | "union"
  | "pagi"
  | "yahav"
  | "massad"
  | "beyahadBishvilha"
  | "behatsdaa"
  | "oneZero";

export interface CredentialField {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  exactLength?: number;
  numeric?: boolean;
}

export type BankKind = "bank" | "card";

export interface BankProviderInfo {
  id: BankProvider;
  name: string;
  kind: BankKind;
  color: string;
  blurb: string;
  /** Domain used to fetch the favicon logo via Google's S2 API. */
  domain: string;
  credentialFields: CredentialField[];
  enabled: boolean;
  /**
   * True when the underlying scraper supports OTP-driven login flows that we
   * can drive in-process. Currently only OneZero — Hapoalim/Leumi/etc. expose
   * the methods on the base interface but no concrete implementation, so 2FA
   * on those banks falls back to the manual (showBrowser) path.
   */
  supportsProgrammaticTwoFactor?: boolean;
}

export interface OllamaModelInfo {
  name: string;
  sizeGb: number;
  description: string;
  recommended?: boolean;
}

export const RECOMMENDED_OLLAMA_MODELS: OllamaModelInfo[] = [
  {
    name: "llama3.2:3b",
    sizeGb: 2.0,
    description: "Recommended. Fast and accurate enough for categorizing.",
    recommended: true,
  },
  {
    name: "llama3.2:1b",
    sizeGb: 1.3,
    description: "Smallest and fastest. Slightly less accurate.",
  },
  {
    name: "llama3.1:8b",
    sizeGb: 4.7,
    description: "Higher quality, slower, larger download.",
  },
  {
    name: "qwen2.5:3b",
    sizeGb: 1.9,
    description: "Alternative 3B model from Alibaba.",
  },
];

export interface GeminiModelInfo {
  name: string;
  description: string;
  recommended?: boolean;
}

export const RECOMMENDED_GEMINI_MODELS: GeminiModelInfo[] = [
  {
    name: "gemini-3.5-flash",
    description: "Latest stable Flash model. Best default for categorization.",
    recommended: true,
  },
  {
    name: "gemini-3.1-flash-lite",
    description: "Stable low-latency option with lower cost.",
  },
  {
    name: "gemini-2.5-flash",
    description: "Stable balanced model for high-volume tasks.",
  },
  {
    name: "gemini-2.5-flash-lite",
    description: "Stable fastest and most budget-friendly 2.5 model.",
  },
  {
    name: "gemini-2.5-pro",
    description: "Stable higher-quality model for more complex categorization.",
  },
];

export const BANK_PROVIDERS: BankProviderInfo[] = [
  {
    id: "isracard",
    name: "Isracard",
    kind: "card",
    color: "#E50019",
    blurb: "Israeli Mastercard / Visa",
    domain: "isracard.co.il",
    credentialFields: [
      {
        key: "id",
        label: "ID Number",
        type: "text",
        placeholder: "9-digit Israeli ID",
        hint: "Your 9-digit Israeli national ID (Teudat Zehut). Not your card number.",
        maxLength: 9,
        numeric: true,
      },
      {
        key: "card6Digits",
        label: "Last 6 Digits of Your Card",
        type: "text",
        placeholder: "e.g. 123456",
        hint: "The last 6 digits of your Isracard credit card number. This is NOT your ID.",
        exactLength: 6,
        numeric: true,
      },
      {
        key: "password",
        label: "Isracard Password",
        type: "password",
        placeholder: "Password you use on digital.isracard.co.il",
        hint: "The same password you use to log in on the Isracard website.",
      },
    ],
    enabled: true,
  },
  {
    id: "cal",
    name: "Visa Cal",
    kind: "card",
    color: "#1B4E97",
    blurb: "Cal-branded cards",
    domain: "cal-online.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "max",
    name: "Max",
    kind: "card",
    color: "#FF6B00",
    blurb: "Formerly Leumi Card",
    domain: "max.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "hapoalim",
    name: "Bank Hapoalim",
    kind: "bank",
    color: "#E2231A",
    blurb: "Includes Poalim wallets",
    domain: "bankhapoalim.co.il",
    credentialFields: [
      { key: "userCode", label: "User Code", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "leumi",
    name: "Bank Leumi",
    kind: "bank",
    color: "#1976A4",
    blurb: "Personal & business accounts",
    domain: "leumi.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "mizrahi",
    name: "Mizrahi Tefahot",
    kind: "bank",
    color: "#0066B3",
    blurb: "Personal & mortgage banking",
    domain: "mizrahi-tefahot.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "discount",
    name: "Bank Discount",
    kind: "bank",
    color: "#2E9C5C",
    blurb: "Personal & business accounts",
    domain: "discountbank.co.il",
    credentialFields: [
      {
        key: "id",
        label: "ID Number",
        type: "text",
        placeholder: "9-digit Israeli ID",
        maxLength: 9,
        numeric: true,
      },
      { key: "password", label: "Password", type: "password" },
      {
        key: "num",
        label: "Identifier Code",
        type: "text",
        placeholder: "Your קוד מזהה",
        hint: "The 'קוד מזהה' you set up for Discount online banking. May contain letters and numbers, not the same as your account number.",
      },
    ],
    enabled: true,
  },
  {
    id: "mercantile",
    name: "Mercantile Discount",
    kind: "bank",
    color: "#1B6A3C",
    blurb: "Discount-owned subsidiary",
    domain: "mercantile.co.il",
    credentialFields: [
      {
        key: "id",
        label: "ID Number",
        type: "text",
        placeholder: "9-digit Israeli ID",
        maxLength: 9,
        numeric: true,
      },
      { key: "password", label: "Password", type: "password" },
      {
        key: "num",
        label: "Identifier Code",
        type: "text",
        placeholder: "Your קוד מזהה",
        hint: "The 'קוד מזהה' you set up for Mercantile online banking. May contain letters and numbers, not the same as your account number.",
      },
    ],
    enabled: true,
  },
  {
    id: "beinleumi",
    name: "First International (FIBI)",
    kind: "bank",
    color: "#C8102E",
    blurb: "Beinleumi / FIBI",
    domain: "fibi.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "otsarHahayal",
    name: "Otsar Hahayal",
    kind: "bank",
    color: "#7A1F2B",
    blurb: "FIBI subsidiary (merged 2020)",
    domain: "fibi.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "pagi",
    name: "Bank Pagi",
    kind: "bank",
    color: "#9F2241",
    blurb: "Hapoalim's religious-community branch",
    domain: "bankpagi.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "yahav",
    name: "Bank Yahav",
    kind: "bank",
    color: "#0F4D8C",
    blurb: "Public-sector employees · 6 months history",
    domain: "bank-yahav.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      {
        key: "nationalID",
        label: "ID Number",
        type: "text",
        placeholder: "9-digit Israeli ID",
        maxLength: 9,
        numeric: true,
      },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "massad",
    name: "Bank Massad",
    kind: "bank",
    color: "#2B5F2B",
    blurb: "Teachers' bank",
    domain: "bankmassad.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "union",
    name: "Union Bank",
    kind: "bank",
    color: "#003F87",
    blurb: "Merged into Mizrahi-Tefahot (2019)",
    domain: "unionbank.co.il",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "amex",
    name: "American Express IL",
    kind: "card",
    color: "#006FCF",
    blurb: "Isracard-issued Amex cards",
    domain: "americanexpress.co.il",
    credentialFields: [
      {
        key: "id",
        label: "ID Number",
        type: "text",
        placeholder: "9-digit Israeli ID",
        maxLength: 9,
        numeric: true,
      },
      {
        key: "card6Digits",
        label: "Last 6 Digits of Your Card",
        type: "text",
        placeholder: "e.g. 123456",
        exactLength: 6,
        numeric: true,
      },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "beyahadBishvilha",
    name: "Beyahad Bishvilha",
    kind: "card",
    color: "#7E3F8F",
    blurb: "Histadrut benefits / credit",
    domain: "beyahad-bishvilha.co.il",
    credentialFields: [
      {
        key: "id",
        label: "ID Number",
        type: "text",
        placeholder: "9-digit Israeli ID",
        maxLength: 9,
        numeric: true,
      },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "behatsdaa",
    name: "Behatsdaa",
    kind: "card",
    color: "#6E3A7A",
    blurb: "Histadrut subsidies / credit",
    domain: "behatsdaa.org.il",
    credentialFields: [
      {
        key: "id",
        label: "ID Number",
        type: "text",
        placeholder: "9-digit Israeli ID",
        maxLength: 9,
        numeric: true,
      },
      { key: "password", label: "Password", type: "password" },
    ],
    enabled: true,
  },
  {
    id: "oneZero",
    name: "One Zero",
    kind: "bank",
    color: "#000000",
    blurb: "Programmatic 2FA via SMS code",
    domain: "onezerobank.com",
    credentialFields: [
      {
        key: "email",
        label: "Email",
        type: "email",
        placeholder: "you@example.com",
        hint: "The email you use to sign in to One Zero.",
      },
      {
        key: "password",
        label: "Password",
        type: "password",
        placeholder: "Your One Zero password",
      },
      {
        key: "phoneNumber",
        label: "Phone number",
        type: "tel",
        placeholder: "+972501234567",
        hint: "Where the SMS one-time code will be sent. International format including the country code.",
      },
    ],
    enabled: true,
    supportsProgrammaticTwoFactor: true,
  },
];

export interface ExcludedMerchant {
  id: number;
  provider: string;
  merchantKey: string;
  createdAt: string;
}

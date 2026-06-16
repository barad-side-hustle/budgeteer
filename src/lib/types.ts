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
  localDate: string | null;
  billingLocalDate: string | null;
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
  accountName: string | null;
  syncRunId: number;
  kind: "expense" | "income" | "transfer";
  needsReview: boolean;
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
  matchedCardNumber: string | null;
}

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
  income: number;
  net: number;
  isCurrent: boolean;
}

export interface HomeRecentTransaction {
  id: number;
  date: string;
  localDate: string | null;
  description: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  kind: "expense" | "income" | "transfer";
  categoryName: string | null;
  categoryColor: string | null;
  provider: string;
  accountLabel: string | null;
  accountName: string | null;
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

export type VerdictStatus = "under" | "on-track" | "over";

export interface Verdict {
  spent: number;
  projected: number;
  monthLabel: string;
  elapsedDays: number;
  totalDays: number;
  daysUntilPayday: number;
  priorMtd: number;
  deltaAmount: number;
  deltaPercent: number | null;
  typicalMonthly: number | null;
  vsTypicalPercent: number | null;
  projectedStatus: VerdictStatus;
  monthlyTarget: number | null;
  remaining: number | null;
}

export interface Mover {
  categoryId: number;
  name: string;
  color: string;
  icon: string | null;
  current: number;
  prior: number;
  deltaAmount: number;
  deltaPercent: number | null;
  direction: "up" | "down";
  topMerchant: string | null;
  trend: number[];
}

export interface BreakdownItem {
  categoryId: number;
  name: string;
  color: string;
  icon: string | null;
  amount: number;
  percentOfTotal: number;
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
  amount: number | null;
  percent: number | null;
  merchant: string | null;
}

export interface BurndownPayload {
  current: number[];
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

export type ForecastVerdict = "plus" | "tight" | "minus";

export type OverdraftRisk = "none" | "watch" | "high";

export interface Forecast {
  monthLabel: string;
  elapsedDays: number;
  totalDays: number;
  daysLeft: number;
  daysUntilPayday: number;
  incomeMtd: number;
  expensesMtd: number;
  netMtd: number;
  expectedIncome: number;
  projectedExpenses: number;
  projectedNet: number;
  remainingIncome: number;
  remainingExpenses: number;
  verdict: ForecastVerdict;
  safeToSpendRemaining: number;
  safeToSpendPerDay: number;
  safeToSpendThisWeek: number;
  typicalMonthlyExpenses: number | null;
  typicalMonthlyIncome: number | null;
  monthlyTarget: number | null;
  balanceToday: number | null;
  expectedMonthEnd: number | null;
  overdraftRisk: OverdraftRisk;
  hasData: boolean;
  hasBalance: boolean;
}

export interface RecurringCharge {
  merchant: string;
  categoryId: number | null;
  categoryName: string | null;
  amount: number;
  monthsPresent: number;
  monthsConsidered: number;
  lapsed: boolean;
  monthly: number[];
}

export interface FixedVsVariableCategory {
  categoryId: number;
  name: string;
  color: string;
  icon: string | null;
  fixed: number;
  variable: number;
  current: number;
  typical: number;
  deltaPercent: number | null;
}

export interface FixedVsVariable {
  fixedMonthly: number;
  variableMonthly: number;
  typicalMonthly: number;
  byCategory: FixedVsVariableCategory[];
}

export type SavingsType = "subscription" | "category-spike" | "trim-category" | "fees";

export interface SavingsOpportunity {
  id: string;
  type: SavingsType;
  estimatedMonthly: number;
  merchant: string | null;
  categoryId: number | null;
  categoryName: string | null;
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
  amount: number | null;
  amount2: number | null;
  categoryName: string | null;
  merchant: string | null;
  href: string | null;
}

export type AnomalyType =
  | "duplicate-charge"
  | "foreign-charge"
  | "merchant-outlier"
  | "price-creep"
  | "new-subscription"
  | "interest-charge"
  | "fee-spike";

export type AnomalySeverity = "flag" | "watch";

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  merchant: string | null;
  categoryName: string | null;
  amount: number | null;
  amount2: number | null;
  percent: number | null;
  currency: string | null;
  occurredAt: string | null;
  transactionIds: number[];
}

export interface ForecastPayload {
  forecast: Forecast | null;
  fixedVsVariable: FixedVsVariable | null;
  recurring: RecurringCharge[] | null;
  savings: SavingsOpportunity[] | null;
  recommendations: Recommendation[] | null;
  anomalies: Anomaly[] | null;
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
  requiresManualTwoFactor: boolean;
  hasTwoFactorToken: boolean;
}

export type AccountOwnershipType = "personal" | "joint" | "shared";

export interface BankAccount {
  id: number;
  credentialId: number;
  provider: string;
  accountNumber: string;
  name: string;
  ownershipType: AccountOwnershipType;
  balance: number | null;
  balanceCurrency: string | null;
  balanceUpdatedAt: string | null;
  groupKey: string | null;
  groupName: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  currentBalance: number | null;
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
  domain: string;
  credentialFields: CredentialField[];
  enabled: boolean;
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

export interface CardBillMatchingRow {
  billTransactionId: number;
  date: string;
  description: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  linkedAccountNumber: string | null;
}

export interface MatchingCardOption {
  accountNumber: string;
  name: string;
  provider: string;
}

export interface CardBillMatchingData {
  bills: CardBillMatchingRow[];
  cards: MatchingCardOption[];
}

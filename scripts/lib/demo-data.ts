export interface DemoTransaction {
  date: string;
  description: string;
  chargedAmount: number;
  categoryName: string;
  originalAmount?: number;
  originalCurrency?: string;
}

export interface DemoSettings {
  paydayDay: number;
  monthlyTarget: number;
  currentBalance: number;
  currentBalanceDate: string;
}

export interface DemoDataset {
  workspaceName: string;
  bankProvider: string;
  accountNumber: string;
  transactions: DemoTransaction[];
  settings: DemoSettings;
}

interface RecurringDef {
  description: string;
  categoryName: string;
  base: number;
  jitter: number;
  day: number;
  currentBase?: number;
}

interface MerchantDef {
  description: string;
  categoryName: string;
  min: number;
  max: number;
}

const MONTHS = 12;
const SALARY_DESCRIPTION = "Monthly Salary - Acme Ltd";
const SALARY_BASE = 19500;
const SALARY_JITTER = 1200;

const RECURRING: RecurringDef[] = [
  { description: "Maple Court Property Mgmt", categoryName: "Home", base: 5600, jitter: 0, day: 2 },
  {
    description: "Phoenix Auto Insurance",
    categoryName: "Insurance",
    base: 430,
    jitter: 0,
    day: 4,
  },
  { description: "Clalit Health Plan", categoryName: "Insurance", base: 290, jitter: 0, day: 6 },
  { description: "PowerFit Gym", categoryName: "Sports & Hobbies", base: 179, jitter: 0, day: 8 },
  {
    description: "StreamBox Plus",
    categoryName: "Subscriptions",
    base: 89,
    jitter: 0,
    day: 5,
    currentBase: 109,
  },
  {
    description: "Cellcom Mobile & Net",
    categoryName: "Bills & Utilities",
    base: 139,
    jitter: 0,
    day: 16,
  },
  {
    description: "Bank Account Fee",
    categoryName: "Fees & Taxes",
    base: 22,
    jitter: 0,
    day: 3,
  },
];

const MERCHANTS: MerchantDef[] = [
  { description: "Shufersal Deal", categoryName: "Groceries", min: 90, max: 460 },
  { description: "Rami Levy Market", categoryName: "Groceries", min: 70, max: 380 },
  { description: "Cafe Aroma", categoryName: "Coffee & Cafes", min: 16, max: 52 },
  { description: "Giraffe Noodle Bar", categoryName: "Restaurants", min: 60, max: 240 },
  { description: "Paz Fuel Station", categoryName: "Transport", min: 120, max: 320 },
  { description: "Rav-Kav Transit", categoryName: "Transport", min: 20, max: 90 },
  { description: "Castro Fashion", categoryName: "Shopping", min: 80, max: 540 },
  { description: "KSP Electronics", categoryName: "Shopping", min: 120, max: 900 },
  { description: "City Electric Utility", categoryName: "Bills & Utilities", min: 220, max: 560 },
  { description: "SuperPharm", categoryName: "Health", min: 35, max: 240 },
];

export const ALLOWED_CATEGORY_NAMES: string[] = [
  ...new Set([
    "Salary",
    ...RECURRING.map((r) => r.categoryName),
    ...MERCHANTS.map((m) => m.categoryName),
  ]),
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function iso(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function appendAnomalyExemplars(transactions: DemoTransaction[], now: Date): void {
  const year = now.getFullYear();
  const month = now.getMonth();
  const clamp = (day: number) => Math.min(day, now.getDate());
  const prev = new Date(year, month - 1, 1);
  const prevYear = prev.getFullYear();
  const prevMonth = prev.getMonth();

  transactions.push(
    {
      date: iso(year, month, clamp(9)),
      description: "Giraffe Noodle Bar",
      chargedAmount: -248,
      categoryName: "Restaurants",
    },
    {
      date: iso(year, month, clamp(11)),
      description: "Giraffe Noodle Bar",
      chargedAmount: -248,
      categoryName: "Restaurants",
    },
    {
      date: iso(year, month, clamp(6)),
      description: "Nimbus Cloud Services",
      chargedAmount: -329.5,
      categoryName: "Subscriptions",
      originalAmount: -89.99,
      originalCurrency: "USD",
    },
    {
      date: iso(year, month, clamp(7)),
      description: "PowerFit Gym",
      chargedAmount: -590,
      categoryName: "Sports & Hobbies",
    },
    {
      date: iso(prevYear, prevMonth, 20),
      description: "Lingo Pro Languages",
      chargedAmount: -49.9,
      categoryName: "Subscriptions",
    },
    {
      date: iso(year, month, clamp(5)),
      description: "Lingo Pro Languages",
      chargedAmount: -49.9,
      categoryName: "Subscriptions",
    },
    {
      date: iso(year, month, clamp(4)),
      description: "ריבית חובה",
      chargedAmount: -92,
      categoryName: "Fees & Taxes",
    },
    {
      date: iso(year, month, clamp(8)),
      description: "FX Conversion Fee",
      chargedAmount: -95,
      categoryName: "Fees & Taxes",
    },
  );
}

export function generateDemoDataset(now: Date): DemoDataset {
  const rng = mulberry32(0x5eed1234);
  const transactions: DemoTransaction[] = [];
  const todayIso = iso(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const isCurrent = i === 0;
    const cutoff = isCurrent ? now.getDate() : lastDayOfMonth(year, month);

    const salaryDay = Math.min(10, lastDayOfMonth(year, month));
    if (salaryDay <= cutoff) {
      transactions.push({
        date: iso(year, month, salaryDay),
        description: SALARY_DESCRIPTION,
        chargedAmount: round2(SALARY_BASE + (rng() - 0.5) * SALARY_JITTER),
        categoryName: "Salary",
      });
    }

    for (const r of RECURRING) {
      const day = Math.min(r.day, lastDayOfMonth(year, month));
      if (day > cutoff) continue;
      const base = isCurrent && r.currentBase != null ? r.currentBase : r.base;
      const amount = base + (rng() - 0.5) * r.jitter;
      transactions.push({
        date: iso(year, month, day),
        description: r.description,
        chargedAmount: -round2(amount),
        categoryName: r.categoryName,
      });
    }

    const span = isCurrent ? cutoff : lastDayOfMonth(year, month);
    const count = 10 + Math.floor(rng() * 9);
    for (let k = 0; k < count; k++) {
      const day = 1 + Math.floor(rng() * span);
      const m = MERCHANTS[Math.floor(rng() * MERCHANTS.length)];
      const amount = m.min + rng() * (m.max - m.min);
      transactions.push({
        date: iso(year, month, day),
        description: m.description,
        chargedAmount: -round2(amount),
        categoryName: m.categoryName,
      });
    }
  }

  appendAnomalyExemplars(transactions, now);

  transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    workspaceName: "Demo",
    bankProvider: "hapoalim",
    accountNumber: "DEMO-0001",
    transactions,
    settings: {
      paydayDay: 10,
      monthlyTarget: 3000,
      currentBalance: 42850,
      currentBalanceDate: todayIso,
    },
  };
}

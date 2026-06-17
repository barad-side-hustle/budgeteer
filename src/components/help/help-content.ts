export type HelpPageKey = "home" | "transactions" | "review" | "budget" | "insights";

export type HelpIconName =
  | "AlertTriangle"
  | "ArrowLeftRight"
  | "CalendarRange"
  | "ChevronsUpDown"
  | "CreditCard"
  | "Filter"
  | "Gauge"
  | "LineChart"
  | "ListChecks"
  | "PiggyBank"
  | "Sparkles"
  | "Tags"
  | "Wallet";

export interface HelpSection {
  id: string;
  icon: HelpIconName;
}

export const HELP_SECTIONS: Record<HelpPageKey, HelpSection[]> = {
  home: [
    { id: "cashFlow", icon: "Wallet" },
    { id: "trend", icon: "LineChart" },
    { id: "typicalMonth", icon: "Gauge" },
    { id: "recentActivity", icon: "ArrowLeftRight" },
    { id: "flagged", icon: "ListChecks" },
  ],
  transactions: [
    { id: "kindFilter", icon: "Filter" },
    { id: "accountFilter", icon: "Filter" },
    { id: "period", icon: "CalendarRange" },
    { id: "cardMatch", icon: "CreditCard" },
    { id: "cardExpand", icon: "ChevronsUpDown" },
    { id: "rowStates", icon: "Tags" },
    { id: "dateBasis", icon: "CalendarRange" },
  ],
  review: [
    { id: "whyFlagged", icon: "AlertTriangle" },
    { id: "queue", icon: "ListChecks" },
    { id: "actions", icon: "Tags" },
    { id: "cardMatch", icon: "CreditCard" },
  ],
  budget: [
    { id: "autoVsManual", icon: "PiggyBank" },
    { id: "average", icon: "CalendarRange" },
    { id: "spendBars", icon: "Gauge" },
    { id: "detail", icon: "ArrowLeftRight" },
  ],
  insights: [
    { id: "anomalies", icon: "AlertTriangle" },
    { id: "recommendations", icon: "Sparkles" },
    { id: "forecast", icon: "LineChart" },
    { id: "ranges", icon: "CalendarRange" },
  ],
};

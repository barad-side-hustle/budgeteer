#!/usr/bin/env bun

import { spawn } from "node:child_process";

const dynamicNamespaces = [
  "banks.*",
  "categoriesSeeded.*",
  "settings.sidebar.*",
  "nav.*",
  "recommendations.*",
  "anomalies.*",
];

const baseline = [
  "setup.*",
  "common.*",
  "transactions.allCategories",
  "transactions.allAccounts",
  "transactions.eventCardMatched",
  "transactions.eventCardMatchedTooltip",
  "transactions.eventCardUnmatched",
  "transactions.eventCardUnmatchedTooltip",
  "settings.bank.transactionsCount",
  "settings.bank.justNow",
  "settings.bank.minutesAgo",
  "settings.bank.hoursAgo",
  "settings.bank.daysAgo",
  "settings.categories.title",
  "settings.categories.description",
  "settings.categories.tabExpense",
  "settings.categories.tabIncome",
  "settings.categories.searchPlaceholder",
  "settings.categories.newGroupButton",
  "settings.categories.newGroupDialogTitle",
  "settings.categories.newGroupName",
  "settings.categories.newGroupNamePlaceholder",
  "settings.categories.newGroupKind",
  "settings.categories.createButton",
  "settings.categories.createdToast",
  "settings.categories.createGroupFailed",
  "settings.categories.noMatching",
  "settings.categories.ungrouped",
  "settings.categories.editGroup",
  "settings.categories.spentLabel",
  "settings.categories.tracking",
  "settings.categories.noBudget",
];

const args = [
  "--bun",
  "@lingual/i18n-check@latest",
  "--format",
  "next-intl",
  "--source",
  "en",
  "--locales",
  "src/i18n/messages",
  "--unused",
  "src",
  "--ignore",
  ...dynamicNamespaces,
  ...baseline,
];

const child = spawn("bunx", args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));

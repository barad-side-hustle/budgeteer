import "server-only";

import { CompanyTypes, createScraper } from "israeli-bank-scrapers";
import type { ScrapedTransaction, ScrapeResult } from "@/server/scrapers/types";

export interface OneZeroFirstSyncOptions {
  email: string;
  password: string;
  phoneNumber: string;
  startDate: Date;
  awaitOtp: () => Promise<string>;
  onOtpSubmitted?: () => void;
}

export interface OneZeroSubsequentSyncOptions {
  email: string;
  password: string;
  otpLongTermToken: string;
  startDate: Date;
}

export interface OneZeroFirstSyncResult extends ScrapeResult {
  otpLongTermToken?: string;
}

const SCRAPER_TIMEOUT_MS = 60000;

function buildScraper(startDate: Date) {
  return createScraper({
    companyId: CompanyTypes.oneZero,
    startDate,
    combineInstallments: false,
    showBrowser: false,
    timeout: SCRAPER_TIMEOUT_MS,
  });
}

function mapAccounts(
  scrapeResult: Awaited<ReturnType<ReturnType<typeof buildScraper>["scrape"]>>,
): ScrapeResult["accounts"] {
  return (scrapeResult.accounts ?? []).map((account) => ({
    accountNumber: account.accountNumber,
    balance: account.balance,
    transactions: account.txns.map(
      (txn): ScrapedTransaction => ({
        type: txn.type === "installments" ? "installments" : "normal",
        identifier: txn.identifier ?? undefined,
        date: txn.date,
        processedDate: txn.processedDate,
        originalAmount: txn.originalAmount,
        originalCurrency: txn.originalCurrency,
        chargedAmount: txn.chargedAmount,
        chargedCurrency: txn.chargedCurrency ?? undefined,
        description: txn.description,
        memo: txn.memo ?? undefined,
        installments: txn.installments
          ? { number: txn.installments.number, total: txn.installments.total }
          : undefined,
        status: txn.status === "completed" ? "completed" : "pending",
      }),
    ),
  }));
}

export async function scrapeOneZeroFirstTime(
  opts: OneZeroFirstSyncOptions,
): Promise<OneZeroFirstSyncResult> {
  const scraper = buildScraper(opts.startDate);

  const trigger = await scraper.triggerTwoFactorAuth(opts.phoneNumber);
  if (!trigger.success) {
    return {
      success: false,
      accounts: [],
      errorMessage: trigger.errorMessage ?? "Failed to send 2FA code to your phone.",
    };
  }

  let otpCode: string;
  try {
    otpCode = await opts.awaitOtp();
  } catch (err) {
    return {
      success: false,
      accounts: [],
      errorMessage: err instanceof Error ? err.message : "OTP entry was cancelled.",
    };
  }
  opts.onOtpSubmitted?.();

  const tokenResult = await scraper.getLongTermTwoFactorToken(otpCode);
  if (!tokenResult.success) {
    return {
      success: false,
      accounts: [],
      errorMessage: tokenResult.errorMessage ?? "The one-time code was rejected by One Zero.",
    };
  }

  const longTermToken = tokenResult.longTermTwoFactorAuthToken;

  const scrapeResult = await scraper.scrape({
    email: opts.email,
    password: opts.password,
    otpLongTermToken: longTermToken,
  });

  if (!scrapeResult.success) {
    return {
      success: false,
      accounts: [],
      errorMessage: scrapeResult.errorMessage ?? "Scrape failed after login.",
      otpLongTermToken: longTermToken,
    };
  }

  return {
    success: true,
    accounts: mapAccounts(scrapeResult),
    otpLongTermToken: longTermToken,
  };
}

export async function scrapeOneZeroWithToken(
  opts: OneZeroSubsequentSyncOptions,
): Promise<ScrapeResult> {
  const scraper = buildScraper(opts.startDate);
  const scrapeResult = await scraper.scrape({
    email: opts.email,
    password: opts.password,
    otpLongTermToken: opts.otpLongTermToken,
  });

  if (!scrapeResult.success) {
    return {
      success: false,
      accounts: [],
      errorMessage: scrapeResult.errorMessage ?? "Scrape failed.",
    };
  }

  return {
    success: true,
    accounts: mapAccounts(scrapeResult),
  };
}

import "server-only";

import { CompanyTypes, createScraper } from "israeli-bank-scrapers";
import type { BankProvider } from "@/lib/types";
import { getWorkspaceSetting } from "@/server/db/queries/settings";
import type { ScrapedTransaction, ScrapeResult } from "@/server/scrapers/types";

export const PROVIDER_MAP: Record<string, CompanyTypes> = {
  isracard: CompanyTypes.isracard,
  cal: CompanyTypes.visaCal,
  max: CompanyTypes.max,
  amex: CompanyTypes.amex,
  hapoalim: CompanyTypes.hapoalim,
  leumi: CompanyTypes.leumi,
  mizrahi: CompanyTypes.mizrahi,
  discount: CompanyTypes.discount,
  mercantile: CompanyTypes.mercantile,
  beinleumi: CompanyTypes.beinleumi,
  otsarHahayal: CompanyTypes.otsarHahayal,
  union: CompanyTypes.union,
  pagi: CompanyTypes.pagi,
  yahav: CompanyTypes.yahav,
  massad: CompanyTypes.massad,
  beyahadBishvilha: CompanyTypes.beyahadBishvilha,
  behatsdaa: CompanyTypes.behatsdaa,
  oneZero: CompanyTypes.oneZero,
};

function sanitizeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "An unknown error occurred during scraping";
  }
  let msg = error.message;
  msg = msg.replace(/\b\d{5,}\b/g, "[REDACTED]");
  msg = msg.replace(/"(password|id|card6Digits|cardSuffix)"\s*:\s*"[^"]*"/gi, '"$1":"[REDACTED]"');
  msg = msg.replace(/\b(password|id|card6Digits|cardSuffix)\s*=\s*\S+/gi, "$1=[REDACTED]");
  return msg;
}

function classifyError(error: unknown): {
  retryable: boolean;
  friendly: string | null;
} {
  if (!(error instanceof Error)) {
    return { retryable: false, friendly: null };
  }
  const msg = error.message;

  if (/Block Automation|Cloudflare|captcha|recaptcha/i.test(msg)) {
    return {
      retryable: false,
      friendly:
        "The bank's bot protection blocked this sync. It usually clears after a few hours (often overnight). Wait and try again. You can also enable 'Show browser during sync' in settings - headful browsers are harder to detect.",
    };
  }

  if (/reqName=ValidateIdData/.test(msg)) {
    return {
      retryable: false,
      friendly:
        "Isracard rejected your ID and card combination. Double-check the 'Last 6 Digits of Your Card' field - it should be the last 6 digits of your credit card number, NOT your Israeli ID. Re-run setup from the settings drawer to fix it.",
    };
  }

  if (/Unexpected end of JSON input/.test(msg) || /fetchPostWithinPage parse error/.test(msg)) {
    return {
      retryable: true,
      friendly:
        "The bank returned an empty response. This usually means temporary rate limiting or a flaky endpoint on their side. We'll retry automatically; if it keeps failing, wait a few minutes and try again.",
    };
  }

  if (/net::ERR_/i.test(msg) || /ECONNRESET|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
    return {
      retryable: true,
      friendly: "Network error reaching the bank. Check your connection and try again.",
    };
  }

  if (/Navigation timeout|TimeoutError/i.test(msg)) {
    return {
      retryable: true,
      friendly:
        "The bank's site took too long to respond. Often temporary - try again in a minute.",
    };
  }

  return { retryable: false, friendly: null };
}

const FRIENDLY_ERRORS: Record<string, string> = {
  INVALID_PASSWORD:
    "The credentials were rejected by the bank. Double-check ID, card last 6 digits, and password.",
  CHANGE_PASSWORD:
    "The bank is asking you to change your password. Log in via the bank's website first.",
  ACCOUNT_BLOCKED: "The account is blocked by the bank. Resolve this on the bank's website.",
  TIMEOUT: "The scrape timed out. The bank's site may be slow or down. Try again.",
  TWO_FACTOR_RETRIEVER_MISSING:
    "This account is asking for 2FA. For most banks, turn on 'This account requires 2FA' in the bank's settings so Budgeteer shows the browser and you can solve it manually. For One Zero, make sure the phone number is set on the account.",
  GENERIC:
    "The scraper failed unexpectedly. Run with 'Show browser during sync' enabled to see what's happening.",
  GENERAL_ERROR:
    "The scraper failed unexpectedly. Run with 'Show browser during sync' enabled to see what's happening.",
};

async function runScrape(
  provider: BankProvider,
  credentials: Record<string, string>,
  startDate: Date,
  showBrowser: boolean,
): Promise<ScrapeResult> {
  const companyId = PROVIDER_MAP[provider];
  if (!companyId) {
    return {
      success: false,
      accounts: [],
      errorMessage: `Unsupported provider: ${provider}`,
    };
  }

  const chromiumArgs = [
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
  ];
  if (process.env.BUDGETEER_DISABLE_CHROMIUM_SANDBOX === "1") {
    chromiumArgs.push("--no-sandbox");
  }

  const scraper = createScraper({
    companyId,
    startDate,
    combineInstallments: false,
    showBrowser,
    verbose: showBrowser,
    timeout: 60000,
    args: chromiumArgs,
  });

  const result = await scraper.scrape(credentials as Parameters<typeof scraper.scrape>[0]);

  if (!result.success) {
    const errorType = result.errorType ?? "GENERIC";
    console.error(`[scraper] failed (${errorType}):`, result.errorMessage);
    const friendly = FRIENDLY_ERRORS[errorType];
    const detail = result.errorMessage ? sanitizeError(new Error(result.errorMessage)) : errorType;
    return {
      success: false,
      accounts: [],
      errorMessage: friendly ? `${friendly} (${detail})` : `Scraping failed: ${detail}`,
    };
  }

  const txnCount = (result.accounts ?? []).reduce((sum, a) => sum + a.txns.length, 0);
  console.log(
    `[scraper] success: ${result.accounts?.length ?? 0} account(s), ${txnCount} transaction(s)`,
  );

  const accounts = (result.accounts ?? []).map((account) => ({
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

  return { success: true, accounts };
}

interface ScrapeBankOptions {
  manualTwoFactor?: boolean;
}

export async function scrapeBank(
  workspaceId: number,
  provider: BankProvider,
  credentials: Record<string, string>,
  startDate: Date,
  options: ScrapeBankOptions = {},
): Promise<ScrapeResult> {
  const workspaceShowBrowser = getWorkspaceSetting(workspaceId, "scraper_show_browser") === "true";
  const showBrowser = options.manualTwoFactor === true || workspaceShowBrowser;
  const MAX_ATTEMPTS = 2;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(
        `[scraper] starting scrape for ${provider} from ${startDate.toISOString()} (attempt ${attempt}/${MAX_ATTEMPTS}, showBrowser=${showBrowser})`,
      );
      return await runScrape(provider, credentials, startDate, showBrowser);
    } catch (error) {
      lastError = error;
      console.error(`[scraper] unexpected error on attempt ${attempt}:`, sanitizeError(error));
      const { retryable } = classifyError(error);
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      const backoffMs = 2000 * attempt;
      console.log(`[scraper] retryable error, waiting ${backoffMs}ms`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  const { friendly } = classifyError(lastError);
  const detail = sanitizeError(lastError);
  return {
    success: false,
    accounts: [],
    errorMessage: friendly ? `${friendly} (${detail})` : detail,
  };
}

import { describe, expect, test } from "bun:test";

import {
  CREDIT_CARD_PAYMENT_PATTERNS,
  detectKind,
  isAtmWithdrawal,
  matchCardPaymentIssuer,
  matchesCreditCardPayment,
  matchesInternalTransfer,
} from "@/server/lib/transfers";

describe("detectKind — credit card settlements", () => {
  test("plural 'כרטיסי אשראי' on a bank account is a transfer", () => {
    expect(detectKind("כרטיסי אשראי ל", "hapoalim", -1000)).toBe("transfer");
  });

  test("'כאל' on a bank account is a transfer", () => {
    expect(detectKind("כאל", "leumi", -500)).toBe("transfer");
  });

  test("newly added keywords (אמקס, leumi card) on a bank account are transfers", () => {
    expect(detectKind("אמקס", "hapoalim", -800)).toBe("transfer");
    expect(detectKind("LEUMI CARD", "leumi", -800)).toBe("transfer");
  });

  test("a normal credit-card purchase is NOT a settlement (provider gate)", () => {
    expect(detectKind("Cal - Gett", "isracard", -30)).toBe("expense");
    expect(detectKind("כאל", "isracard", -30)).toBe("expense");
  });

  test("bank income without a settlement keyword is income", () => {
    expect(detectKind("משכורת", "hapoalim", 12000)).toBe("income");
  });
});

describe("isAtmWithdrawal", () => {
  test("matches ATM keywords", () => {
    expect(isAtmWithdrawal("משיכת מזומן")).toBe(true);
    expect(isAtmWithdrawal("כספומט בנק הפועלים")).toBe(true);
    expect(isAtmWithdrawal("ATM WITHDRAWAL")).toBe(true);
  });

  test("does not match a normal merchant", () => {
    expect(isAtmWithdrawal("שופרסל")).toBe(false);
  });
});

describe("matchesInternalTransfer", () => {
  test("matches transfer keywords", () => {
    expect(matchesInternalTransfer("העברה לחשבון")).toBe(true);
    expect(matchesInternalTransfer("BANK TRANSFER")).toBe(true);
    expect(matchesInternalTransfer("wire out")).toBe(true);
  });

  test("does not match a normal merchant", () => {
    expect(matchesInternalTransfer("שופרסל")).toBe(false);
  });
});

describe("matchCardPaymentIssuer", () => {
  test("maps issuer-specific descriptions to their issuer", () => {
    expect(matchCardPaymentIssuer("חיוב ישראכרט")).toEqual({ issuer: "isracard" });
    expect(matchCardPaymentIssuer("תשלום לכ.א.ל")).toEqual({ issuer: "cal" });
    expect(matchCardPaymentIssuer("מקסימום פיננסים")).toEqual({ issuer: "max" });
    expect(matchCardPaymentIssuer("לאומי קארד")).toEqual({ issuer: "max" });
    expect(matchCardPaymentIssuer("AMERICAN EXPRESS")).toEqual({ issuer: "amex" });
    expect(matchCardPaymentIssuer("MAX")).toEqual({ issuer: "max" });
    expect(matchCardPaymentIssuer("CAL")).toEqual({ issuer: "cal" });
    expect(matchCardPaymentIssuer("AMEX")).toEqual({ issuer: "amex" });
  });

  test("issuer wins over network when both appear", () => {
    expect(matchCardPaymentIssuer("ויזה כ.א.ל")).toEqual({ issuer: "cal" });
    expect(matchCardPaymentIssuer("VISA ישראכרט")).toEqual({ issuer: "isracard" });
  });

  test("recognizes real Leumi bank-statement card labels", () => {
    expect(matchCardPaymentIssuer("לאומי ויזה(כא)")).toEqual({ issuer: "cal" });
    expect(matchCardPaymentIssuer("מקס איט פיננ-י")).toEqual({ issuer: "max" });
    expect(matchCardPaymentIssuer("לאומי מאסטרקרד")).toEqual({ issuer: "ambiguous" });
  });

  test("network-only descriptions are ambiguous", () => {
    expect(matchCardPaymentIssuer("חיוב ויזה")).toEqual({ issuer: "ambiguous" });
    expect(matchCardPaymentIssuer("מאסטרקארד")).toEqual({ issuer: "ambiguous" });
    expect(matchCardPaymentIssuer("כרטיסי אשראי")).toEqual({ issuer: "ambiguous" });
  });

  test("MAX issuer pattern matches the standalone token", () => {
    expect(matchCardPaymentIssuer("תשלום MAX")).toEqual({ issuer: "max" });
    expect(matchCardPaymentIssuer("מקסימום")).toEqual({ issuer: "max" });
  });

  test("non-card descriptions return null", () => {
    expect(matchCardPaymentIssuer("העברת משכורת")).toBeNull();
    expect(matchCardPaymentIssuer("")).toBeNull();
  });

  test("resolver matches exactly when matchesCreditCardPayment matches", () => {
    const samples = [
      "חיוב ויזה",
      "ישראכרט",
      "כ.א.ל",
      "מקסימום",
      "מאסטרקארד",
      "אמריקן אקספרס",
      "דיינרס",
      "כרטיסי אשראי",
      "העברת משכורת",
      "סופרמרקט",
      "AMEX",
      "MAX",
      "CAL",
      "ISRACARD",
      "LEUMI CARD",
    ];
    for (const s of samples) {
      expect(matchCardPaymentIssuer(s) !== null).toBe(matchesCreditCardPayment(s));
    }
  });

  test("CREDIT_CARD_PAYMENT_PATTERNS covers issuer and ambiguous patterns", () => {
    const matchesAnyPattern = (s: string) => CREDIT_CARD_PAYMENT_PATTERNS.some((p) => p.test(s));
    expect(matchesAnyPattern("ישראכרט")).toBe(true);
    expect(matchesAnyPattern("MAX")).toBe(true);
    expect(matchesAnyPattern("חיוב ויזה")).toBe(true);
    expect(matchesAnyPattern("סופרמרקט")).toBe(false);
  });

  test("does not classify the sub-brand names as card payments", () => {
    expect(matchCardPaymentIssuer("בהצדעה")).toBeNull();
    expect(matchCardPaymentIssuer("ביחד בשבילך")).toBeNull();
    expect(detectKind("בהצדעה", "leumi", -100)).toBe("expense");
  });

  test("CREDIT_CARD_PAYMENT_PATTERNS holds every issuer and network pattern", () => {
    expect(CREDIT_CARD_PAYMENT_PATTERNS).toHaveLength(26);
  });
});

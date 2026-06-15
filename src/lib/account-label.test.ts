import { describe, expect, test } from "bun:test";

import { getAccountDisplayLabel } from "@/lib/account-label";

describe("getAccountDisplayLabel", () => {
  test("a card shows its last-4 number with the issuer beneath", () => {
    expect(getAccountDisplayLabel("cal", "Cal", "2315", "ויזה כאל")).toEqual({
      primary: "2315",
      secondary: "ויזה כאל",
    });
  });

  test("distinct cards on one credential are told apart by number", () => {
    const a = getAccountDisplayLabel("cal", "Cal", "2315", "ויזה כאל");
    const b = getAccountDisplayLabel("cal", "Cal", "8682", "ויזה כאל");
    expect(a.primary).not.toBe(b.primary);
  });

  test("a card with no distinct credential label shows the issuer name beneath", () => {
    expect(getAccountDisplayLabel("cal", "Cal", "2315", "Cal")).toEqual({
      primary: "2315",
      secondary: "Cal",
    });
  });

  test("a bank account shows the account number with the bank name beneath", () => {
    expect(getAccountDisplayLabel("leumi", "Bank Leumi", "946-354388_73", "לאומי חדש")).toEqual({
      primary: "946-354388_73",
      secondary: "Bank Leumi",
    });
  });

  test("a bank with no account number falls back to the provider name", () => {
    expect(getAccountDisplayLabel("leumi", "Bank Leumi", null, null)).toEqual({
      primary: "Bank Leumi",
      secondary: null,
    });
  });
});

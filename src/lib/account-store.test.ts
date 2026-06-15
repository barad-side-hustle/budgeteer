import { afterEach, describe, expect, test } from "bun:test";
import {
  getAccountSelectionSync,
  getAccountTokensSync,
  setAccountTokens,
  toggleAccountToken,
} from "@/lib/account-store";

afterEach(() => {
  setAccountTokens([]);
});

describe("account-store token helpers", () => {
  test("starts empty", () => {
    expect(getAccountTokensSync()).toEqual([]);
    expect(getAccountSelectionSync()).toBeNull();
  });

  test("toggleAccountToken adds then removes a token", () => {
    toggleAccountToken("a:1");
    expect(getAccountTokensSync()).toEqual(["a:1"]);
    expect(getAccountSelectionSync()).toBe("a:1");

    toggleAccountToken("a:2");
    expect(getAccountTokensSync()).toEqual(["a:1", "a:2"]);
    expect(getAccountSelectionSync()).toBe("a:1,a:2");

    toggleAccountToken("a:1");
    expect(getAccountTokensSync()).toEqual(["a:2"]);
    expect(getAccountSelectionSync()).toBe("a:2");
  });

  test("setAccountTokens replaces the whole list and empty clears to null", () => {
    setAccountTokens(["a:3", "a:4"]);
    expect(getAccountTokensSync()).toEqual(["a:3", "a:4"]);

    setAccountTokens([]);
    expect(getAccountTokensSync()).toEqual([]);
    expect(getAccountSelectionSync()).toBeNull();
  });
});

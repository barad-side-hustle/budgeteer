import { describe, expect, it } from "bun:test";
import { isValidOpenRouterKey, resolveOpenRouterModel } from "@/lib/openrouter";

describe("resolveOpenRouterModel", () => {
  it("prefers a non-empty custom model id over the selected one", () => {
    expect(resolveOpenRouterModel("  openai/gpt-4o  ", "anthropic/claude-3.5-haiku")).toBe(
      "openai/gpt-4o",
    );
  });

  it("falls back to the selected model when custom is blank", () => {
    expect(resolveOpenRouterModel("   ", "anthropic/claude-3.5-haiku")).toBe(
      "anthropic/claude-3.5-haiku",
    );
  });

  it("returns an empty string when both are blank", () => {
    expect(resolveOpenRouterModel("", "")).toBe("");
  });
});

describe("isValidOpenRouterKey", () => {
  it("accepts keys with the sk-or- prefix", () => {
    expect(isValidOpenRouterKey("sk-or-v1-abc123")).toBe(true);
  });

  it("rejects keys without the prefix", () => {
    expect(isValidOpenRouterKey("sk-ant-api03-abc")).toBe(false);
    expect(isValidOpenRouterKey("")).toBe(false);
    expect(isValidOpenRouterKey("  sk-or-v1-abc  ")).toBe(true);
  });
});

import { describe, expect, test } from "bun:test";
import { getDateBasisFromRequest } from "@/server/lib/date-basis-context";

function reqWith(header: string | null): Request {
  const headers = new Headers();
  if (header != null) headers.set("x-date-basis", header);
  return new Request("http://localhost/api/transactions", { headers });
}

describe("getDateBasisFromRequest", () => {
  test("returns billing when header is billing", () => {
    expect(getDateBasisFromRequest(reqWith("billing"))).toBe("billing");
  });
  test("returns purchase when header is absent", () => {
    expect(getDateBasisFromRequest(reqWith(null))).toBe("purchase");
  });
  test("returns purchase for a garbage header", () => {
    expect(getDateBasisFromRequest(reqWith("nonsense"))).toBe("purchase");
  });
});

import "server-only";

import { type DateBasis, DEFAULT_DATE_BASIS, isDateBasis } from "@/lib/date-basis";

export function getDateBasisFromRequest(req: Request): DateBasis {
  const header = req.headers.get("x-date-basis");
  return isDateBasis(header) ? header : DEFAULT_DATE_BASIS;
}

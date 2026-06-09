import "server-only";

import path from "node:path";

export function getDataDir(): string {
  return process.env.BUDGETEER_DATA_DIR
    ? path.resolve(process.env.BUDGETEER_DATA_DIR)
    : path.join(process.cwd(), "data");
}

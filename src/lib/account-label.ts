import { BANK_PROVIDERS } from "@/lib/types";

export interface AccountDisplayLabel {
  primary: string;
  secondary: string | null;
}

function isCardProvider(provider: string): boolean {
  return BANK_PROVIDERS.find((b) => b.id === provider)?.kind === "card";
}

export function getAccountDisplayLabel(
  provider: string,
  providerName: string,
  accountName: string | null,
  accountLabel: string | null,
): AccountDisplayLabel {
  const account = accountName?.trim() ?? "";
  const label = accountLabel?.trim() ?? "";
  const sameAs = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  if (isCardProvider(provider)) {
    const primary = account || label || providerName;
    const issuer = label && !sameAs(label, primary) ? label : providerName;
    return { primary, secondary: sameAs(issuer, primary) ? null : issuer };
  }

  const primary = account || label;
  const distinct = primary !== "" && !sameAs(primary, providerName);
  return {
    primary: distinct ? primary : providerName,
    secondary: distinct ? providerName : null,
  };
}

export function resolveOpenRouterModel(custom: string, selected: string): string {
  const trimmed = custom.trim();
  return trimmed.length > 0 ? trimmed : selected;
}

export function isValidOpenRouterKey(key: string): boolean {
  return /^sk-or-/.test(key.trim());
}

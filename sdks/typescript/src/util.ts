export function normalizePath(p: string): string {
  return p.trim();
}

export function firstNonEmpty(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    if (v) return v;
  }
  return "";
}

export function shellQuote(p: string): string {
  return "'" + p.replace(/'/g, "'\"'\"'") + "'";
}

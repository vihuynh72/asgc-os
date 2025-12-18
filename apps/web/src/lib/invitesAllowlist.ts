export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function domainSuffixes(domain: string): string[] {
  const parts = domain
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);

  // Require at least "example.com" shape.
  if (parts.length < 2) return [];

  const suffixes: string[] = [];
  for (let i = 0; i <= parts.length - 2; i += 1) {
    suffixes.push(parts.slice(i).join("."));
  }
  return suffixes;
}

export function allowlistKeysForNormalizedEmail(email: string): string[] {
  const at = email.lastIndexOf("@");
  if (at < 0) return [email];

  const domain = email.slice(at + 1).trim().toLowerCase();
  const suffixKeys = domainSuffixes(domain).map((suffix) => `@${suffix}`);
  return Array.from(new Set([email, ...suffixKeys]));
}


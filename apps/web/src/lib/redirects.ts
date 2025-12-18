export const DEFAULT_POST_AUTH_REDIRECT = "/dashboard";

// Used to remember where a user was headed before being sent to /login.
// This is a best-effort UX improvement; it should not be used for authorization decisions.
export const POST_AUTH_REDIRECT_COOKIE = "asgc.postAuthRedirectTo";

export function safeRedirectPathOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value.startsWith("/")) return null;
  // Disallow protocol-relative redirects like `//evil.com`.
  if (value.startsWith("//")) return null;
  return value;
}

export function safeRedirectPath(raw: unknown, fallback: string = DEFAULT_POST_AUTH_REDIRECT): string {
  return safeRedirectPathOrNull(raw) ?? fallback;
}

export function safePostAuthRedirectPath(raw: unknown): string {
  const safe = safeRedirectPath(raw, DEFAULT_POST_AUTH_REDIRECT);
  if (safe === "/login") return DEFAULT_POST_AUTH_REDIRECT;
  if (safe === "/auth" || safe.startsWith("/auth/")) return DEFAULT_POST_AUTH_REDIRECT;
  return safe;
}


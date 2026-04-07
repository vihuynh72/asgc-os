export const DEFAULT_POST_AUTH_REDIRECT = "/dashboard";

export function safeRedirectPathOrNull(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
}

export function safeRedirectPath(raw, fallback = DEFAULT_POST_AUTH_REDIRECT) {
  return safeRedirectPathOrNull(raw) ?? fallback;
}

export function safePostAuthRedirectPath(raw) {
  const safe = safeRedirectPath(raw, DEFAULT_POST_AUTH_REDIRECT);
  if (safe === "/login") return DEFAULT_POST_AUTH_REDIRECT;
  if (safe === "/auth" || safe.startsWith("/auth/")) return DEFAULT_POST_AUTH_REDIRECT;
  return safe;
}

export function buildLoginHref({ redirectTo, error } = {}) {
  const safeRedirectTo = safePostAuthRedirectPath(redirectTo);
  const params = new URLSearchParams();
  if (typeof error === "string" && error.length > 0) params.set("error", error);
  params.set("redirectTo", safeRedirectTo);
  return `/login?${params.toString()}`;
}

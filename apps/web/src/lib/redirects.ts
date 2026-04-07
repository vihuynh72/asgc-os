import {
  DEFAULT_POST_AUTH_REDIRECT as DEFAULT_POST_AUTH_REDIRECT_VALUE,
  safePostAuthRedirectPath as safePostAuthRedirectPathImpl,
  safeRedirectPath as safeRedirectPathImpl,
  safeRedirectPathOrNull as safeRedirectPathOrNullImpl,
} from "./auth/post-auth-redirect.mjs";

export const DEFAULT_POST_AUTH_REDIRECT = DEFAULT_POST_AUTH_REDIRECT_VALUE;

// Used to remember where a user was headed before being sent to /login.
// This is a best-effort UX improvement; it should not be used for authorization decisions.
export const POST_AUTH_REDIRECT_COOKIE = "asgc.postAuthRedirectTo";

export function safeRedirectPathOrNull(raw: unknown): string | null {
  return safeRedirectPathOrNullImpl(raw);
}

export function safeRedirectPath(raw: unknown, fallback: string = DEFAULT_POST_AUTH_REDIRECT): string {
  return safeRedirectPathImpl(raw, fallback);
}

export function safePostAuthRedirectPath(raw: unknown): string {
  return safePostAuthRedirectPathImpl(raw);
}

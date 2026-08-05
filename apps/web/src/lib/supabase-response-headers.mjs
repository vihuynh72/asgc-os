/**
 * @typedef {{ headers: { set(name: string, value: string): void } }} ResponseHeaderWriter
 */

const SUPABASE_CACHE_HEADER_NAMES = ["cache-control", "expires", "pragma"];

/**
 * Forward the cache-safety headers emitted by @supabase/ssr when auth cookies
 * are refreshed.
 *
 * @param {ResponseHeaderWriter} response
 * @param {Record<string, string>} [headersToSet]
 */
export function applySupabaseResponseHeaders(response, headersToSet = {}) {
  for (const [name, value] of Object.entries(headersToSet)) {
    response.headers.set(name, value);
  }
}

/**
 * Preserve Supabase auth cookie writes when a route needs to replace its
 * initially prepared response with an error or redirect response.
 *
 * @param {{ cookies: { getAll(): Array<{ name: string, value: string }> }, headers: { get(name: string): string | null } }} source
 * @param {{ cookies: { set(cookie: { name: string, value: string }): void }, headers: { set(name: string, value: string): void } }} target
 */
export function copySupabaseResponseState(source, target) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }

  for (const name of SUPABASE_CACHE_HEADER_NAMES) {
    const value = source.headers.get(name);
    if (value !== null) {
      target.headers.set(name, value);
    }
  }
}

/**
 * Keep a refreshed session consistent across the current server render and
 * the browser response. Next.js Server Components read the forwarded request,
 * so refreshed cookies must be applied there before NextResponse.next() is
 * created as well as to the eventual response.
 *
 * @param {{ cookies: { set(name: string, value: string): void } }} request
 */
export function createSupabaseProxyResponseBuffer(request) {
  /** @type {Array<{ name: string, value: string, options?: Record<string, unknown> }>} */
  const pendingCookies = [];
  /** @type {Record<string, string>} */
  const pendingHeaders = {};

  return {
    /**
     * @param {Array<{ name: string, value: string, options?: Record<string, unknown> }>} [cookiesToAdd]
     * @param {Record<string, string>} [headersToAdd]
     */
    add(cookiesToAdd = [], headersToAdd = {}) {
      for (const { name, value } of cookiesToAdd) {
        request.cookies.set(name, value);
      }
      pendingCookies.push(...cookiesToAdd);
      Object.assign(pendingHeaders, headersToAdd);
    },

    /**
     * @param {ResponseHeaderWriter & { cookies: { set(name: string, value: string, options?: Record<string, unknown>): void } }} response
     */
    applyTo(response) {
      for (const { name, value, options } of pendingCookies) {
        response.cookies.set(name, value, options);
      }
      applySupabaseResponseHeaders(response, pendingHeaders);
    },
  };
}

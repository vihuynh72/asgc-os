export const PASSWORD_SETUP_PATH = "/password/setup";
import { buildLoginHref, safePostAuthRedirectPath } from "./post-auth-redirect.mjs";

const DEFAULT_PASSWORD_SETUP_MODE = "first_time";
const PASSWORD_SETUP_MODES = new Set([DEFAULT_PASSWORD_SETUP_MODE, "reset"]);

export function normalizePasswordSetupMode(raw) {
  return PASSWORD_SETUP_MODES.has(raw) ? raw : DEFAULT_PASSWORD_SETUP_MODE;
}

function safePasswordSetupRedirect(redirectTo) {
  return safePostAuthRedirectPath(redirectTo);
}

export function buildPasswordSetupHref({ mode, redirectTo }) {
  const safeMode = normalizePasswordSetupMode(mode);
  const safeRedirectTo = safePasswordSetupRedirect(redirectTo);
  return `${PASSWORD_SETUP_PATH}?mode=${encodeURIComponent(safeMode)}&redirectTo=${encodeURIComponent(safeRedirectTo)}`;
}

export function resolveRecoveryCallbackTarget(redirectTo) {
  const safeRedirectTo = safePasswordSetupRedirect(redirectTo);
  const isMfaRecoveryRedirect =
    safeRedirectTo === "/mfa/recover" ||
    safeRedirectTo.startsWith("/mfa/recover?") ||
    safeRedirectTo.startsWith("/mfa/recover/");

  if (isMfaRecoveryRedirect) {
    return {
      location: safeRedirectTo,
      issueMfaRecoveryCookie: true,
    };
  }

  return {
    location: buildPasswordSetupHref({ mode: "reset", redirectTo: safeRedirectTo }),
    issueMfaRecoveryCookie: false,
  };
}

export function buildPasswordResetCallbackUrl({ origin, redirectTo }) {
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", safePasswordSetupRedirect(redirectTo));
  return callbackUrl.toString();
}

export function buildPasswordResetLink({ origin, redirectTo, tokenHash, verificationType }) {
  const resetLink = new URL(buildPasswordResetCallbackUrl({ origin, redirectTo }));
  resetLink.searchParams.set("token_hash", tokenHash);
  resetLink.searchParams.set("type", verificationType);
  return resetLink.toString();
}

export function buildPasswordSetupRecoveryHref({ mode, redirectTo, reason }) {
  if (reason !== "missing_session") return null;

  const safeMode = normalizePasswordSetupMode(mode);
  const safeRedirectTo = safePasswordSetupRedirect(redirectTo);

  if (safeMode === "first_time" || safeMode === "reset") {
    return buildLoginHref({
      error: "password_setup_session_expired",
      redirectTo: safeRedirectTo,
    });
  }

  return null;
}

export function buildPasswordSetupSuccessPayload({ redirectTo, warningReason } = {}) {
  const payload = {
    ok: true,
    redirectTo: safePasswordSetupRedirect(redirectTo),
  };

  if (warningReason === "profile_sync_failed") {
    payload.warningReason = warningReason;
  }

  return payload;
}

export function getPasswordSetupFailureMessage(reason) {
  if (reason === "missing_session") {
    return "Your sign-in session expired before the password could be saved. Reload this page and try again.";
  }

  return "Could not save your password. Try again.";
}

export function getPasswordSetupWarningMessage(reason) {
  if (reason === "profile_sync_failed") {
    return "Password changed. Your account setup status is still syncing, but you can continue.";
  }

  return null;
}

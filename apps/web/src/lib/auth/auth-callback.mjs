import { resolveRecoveryCallbackTarget } from "./password-setup.mjs";

export function finalizeVerifiedAuthCallback({ type, redirectTo, inviteOk }) {
  if (!inviteOk) {
    return {
      location: null,
      issueMfaRecoveryCookie: false,
      clearMfaRecoveryCookie: true,
    };
  }

  if (type !== "recovery") {
    return {
      location: null,
      issueMfaRecoveryCookie: false,
      clearMfaRecoveryCookie: true,
    };
  }

  const recoveryTarget = resolveRecoveryCallbackTarget(redirectTo);
  return {
    location: recoveryTarget.location,
    issueMfaRecoveryCookie: recoveryTarget.issueMfaRecoveryCookie,
    clearMfaRecoveryCookie: !recoveryTarget.issueMfaRecoveryCookie,
  };
}

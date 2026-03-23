export const OTP_CODE_LENGTH = 6;
export const FIRST_TIME_SIGNIN_NEXT_STEP = "setup_password";

export function normalizeOtpCode(value) {
  return String(value ?? "")
    .replace(/\D+/g, "")
    .slice(0, OTP_CODE_LENGTH);
}

export function isCompleteOtpCode(value) {
  return normalizeOtpCode(value).length === OTP_CODE_LENGTH;
}

export function buildFirstTimeVerifyResponse(redirectTo) {
  return {
    ok: true,
    nextStep: FIRST_TIME_SIGNIN_NEXT_STEP,
    redirectTo,
  };
}

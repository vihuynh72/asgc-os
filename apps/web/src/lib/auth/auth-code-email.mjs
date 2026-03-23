import { hashLoginEmailChallengeCode } from "./password-signin.mjs";

export const AUTH_CODE_EMAIL_BRAND = "ASGC OS";
export const AUTH_CODE_EMAIL_TTL_MINUTES = 10;
export const PASSWORD_SIGNIN_CHALLENGE_KIND = "password_signin";
export const FIRST_TIME_SIGNIN_CHALLENGE_KIND = "first_time_signin";

function emailCopyForKind(kind) {
  if (kind === PASSWORD_SIGNIN_CHALLENGE_KIND) {
    return {
      subject: `${AUTH_CODE_EMAIL_BRAND} sign-in code`,
      title: "Verify this browser",
      detail: "Enter this code to finish signing in on this browser.",
    };
  }

  return {
    subject: `${AUTH_CODE_EMAIL_BRAND} sign-in code`,
    title: "Finish your first sign-in",
    detail: "Use this six-digit code to verify your campus email and continue.",
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildAuthCodeEmail({ kind, code, expiresInMinutes }) {
  const copy = emailCopyForKind(kind);
  const safeCode = escapeHtml(code);
  const safeExpires = escapeHtml(expiresInMinutes);
  const safeTitle = escapeHtml(copy.title);
  const safeDetail = escapeHtml(copy.detail);

  return {
    subject: copy.subject,
    text:
      `${copy.title}\n\n` +
      `${copy.detail}\n\n` +
      `Code: ${code}\n` +
      `Expires in ${expiresInMinutes} minutes.\n\n` +
      `If you did not request this code, you can ignore this email.`,
    html:
      "<!doctype html>" +
      `<html><body style="margin:0;background:#f3f5f8;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">` +
      `<div style="margin:0 auto;max-width:560px;border-radius:28px;background:#ffffff;padding:32px;box-shadow:0 24px 60px rgba(15,23,42,0.12);">` +
      `<div style="font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#64748b;font-weight:700;">${AUTH_CODE_EMAIL_BRAND}</div>` +
      `<h1 style="margin:16px 0 10px;font-size:30px;line-height:1.05;letter-spacing:-0.04em;">${safeTitle}</h1>` +
      `<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#475569;">${safeDetail}</p>` +
      `<div style="margin:0 0 20px;border-radius:24px;background:linear-gradient(135deg,#f8fafc,#eef2ff);padding:24px;text-align:center;">` +
      `<div style="font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#64748b;font-weight:700;">One-time code</div>` +
      `<div style="margin-top:12px;font-size:38px;letter-spacing:0.32em;font-weight:700;color:#020617;">${safeCode}</div>` +
      `</div>` +
      `<p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">Expires in ${safeExpires} minutes. If you did not request this code, you can ignore this email.</p>` +
      `</div></body></html>`,
  };
}

export function buildFirstTimeSignInChallengeInsert({
  challengeId,
  userId,
  email,
  code,
  redirectTo,
  requestIp,
  userAgent,
  expiresAt,
  supabaseTokenHash,
  supabaseVerificationType,
  secret,
}) {
  return {
    id: challengeId,
    user_id: userId,
    email,
    challenge_kind: FIRST_TIME_SIGNIN_CHALLENGE_KIND,
    code_hash: hashLoginEmailChallengeCode({
      challengeId,
      code,
      secret,
    }),
    redirect_to: redirectTo,
    request_ip: requestIp,
    user_agent: userAgent,
    expires_at: expiresAt,
    supabase_token_hash: supabaseTokenHash,
    supabase_verification_type: supabaseVerificationType,
  };
}

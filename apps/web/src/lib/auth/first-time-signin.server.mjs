import { randomInt, randomUUID } from "node:crypto";

import { generateSignInLink } from "../authLinks";
import {
  AUTH_CODE_EMAIL_TTL_MINUTES,
  FIRST_TIME_SIGNIN_CHALLENGE_KIND,
  buildAuthCodeEmail,
  buildFirstTimeSignInChallengeInsert,
} from "./auth-code-email.mjs";
import { buildLoginEmailChallengeExpiry } from "./password-signin.mjs";

export async function issueFirstTimeSignInCode({
  admin,
  email,
  redirectTo,
  requestIp,
  userAgent,
  secret,
  sendEmailFn,
}) {
  const signInLink = await generateSignInLink(admin, email, redirectTo);
  const challengeId = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = buildLoginEmailChallengeExpiry(new Date(), AUTH_CODE_EMAIL_TTL_MINUTES);

  const challengeInsert = buildFirstTimeSignInChallengeInsert({
    challengeId,
    userId: signInLink.userId,
    email,
    code,
    redirectTo,
    requestIp,
    userAgent,
    expiresAt,
    supabaseTokenHash: signInLink.hashedToken,
    supabaseVerificationType: signInLink.type,
    secret,
  });

  const { error: insertError } = await admin.from("login_email_challenges").insert(challengeInsert);
  if (insertError) {
    throw new Error(insertError.message || "challenge_insert_failed");
  }

  const emailMessage = buildAuthCodeEmail({
    kind: FIRST_TIME_SIGNIN_CHALLENGE_KIND,
    code,
    expiresInMinutes: AUTH_CODE_EMAIL_TTL_MINUTES,
  });

  try {
    await sendEmailFn({
      to: email,
      subject: emailMessage.subject,
      text: emailMessage.text,
      html: emailMessage.html,
    });
  } catch (error) {
    await admin.from("login_email_challenges").delete().eq("id", challengeId);
    throw error;
  }

  return {
    challengeId,
    challengeKind: FIRST_TIME_SIGNIN_CHALLENGE_KIND,
    redirectTo,
  };
}

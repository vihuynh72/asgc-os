import type { SupabaseClient } from "@supabase/supabase-js";

type SignInLinkType = "magiclink" | "invite";

export type SignInLinkResult = {
  type: SignInLinkType;
  hashedToken: string;
  otp: string | null;
};

type GenerateLinkAttempt =
  | { ok: true; result: SignInLinkResult }
  | { ok: false; message: string };

async function attemptGenerateLink(
  admin: SupabaseClient,
  type: SignInLinkType,
  email: string,
  redirectTo: string,
): Promise<GenerateLinkAttempt> {
  const { data, error } = await admin.auth.admin.generateLink({
    type,
    email,
    options: { redirectTo },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const props = data?.properties;
  if (!props?.hashed_token || !props?.verification_type) {
    return { ok: false, message: "missing_link_data" };
  }

  const verificationType = props.verification_type;
  if (verificationType !== "magiclink" && verificationType !== "invite") {
    return { ok: false, message: "unexpected_link_type" };
  }

  return {
    ok: true,
    result: {
      type: verificationType,
      hashedToken: props.hashed_token,
      otp: props.email_otp ?? null,
    },
  };
}

export async function generateSignInLink(
  admin: SupabaseClient,
  email: string,
  redirectTo: string,
): Promise<SignInLinkResult> {
  const first = await attemptGenerateLink(admin, "magiclink", email, redirectTo);
  if (first.ok) return first.result;

  const second = await attemptGenerateLink(admin, "invite", email, redirectTo);
  if (second.ok) return second.result;

  throw new Error(
    `Failed to generate sign-in link after trying both magiclink and invite methods: ${
      second.message || first.message || "generate_link_failed"
    }`,
  );
}

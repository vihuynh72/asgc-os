import { getEmailEnv } from "./envServer";
import { sendEmail as sendEmailWithProvider } from "./email-sender.mjs";

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendEmailResult = {
  provider: "resend";
  providerMessageId: string | null;
};

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const env = getEmailEnv();

  if (env.EMAIL_PROVIDER !== "resend") {
    throw new Error("Unsupported email provider");
  }

  const result = await sendEmailWithProvider({
    ...input,
    env,
    fetchFn: fetch,
  });

  return {
    provider: "resend",
    providerMessageId: result.providerMessageId,
  };
}

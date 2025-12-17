import { getEmailEnv } from "./envServer";

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export type SendEmailResult = {
  provider: "resend";
  providerMessageId: string | null;
};

function getStringProp(obj: unknown, key: string): string | null {
  if (typeof obj !== "object" || obj === null) return null;
  const rec = obj as Record<string, unknown>;
  return typeof rec[key] === "string" ? rec[key] : null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const env = getEmailEnv();

  if (env.EMAIL_PROVIDER !== "resend") {
    throw new Error("Unsupported email provider");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    }),
  });

  const json = (await res.json().catch(() => null)) as unknown;

  if (!res.ok) {
    const message = getStringProp(json, "message") ?? `Email send failed: ${res.status}`;
    throw new Error(message);
  }

  const providerMessageId = getStringProp(json, "id");

  return { provider: "resend", providerMessageId };
}

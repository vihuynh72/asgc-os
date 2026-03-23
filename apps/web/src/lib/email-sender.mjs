function getStringProp(obj, key) {
  if (typeof obj !== "object" || obj === null) return null;
  const rec = obj;
  return typeof rec[key] === "string" ? rec[key] : null;
}

export async function sendEmail(input) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  const res = await input.fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.env.EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      ...(typeof input.html === "string" && input.html.length > 0 ? { html: input.html } : {}),
    }),
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeout);
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const message = getStringProp(json, "message") ?? `Email send failed: ${res.status}`;
    throw new Error(message);
  }

  return {
    provider: "resend",
    providerMessageId: getStringProp(json, "id"),
  };
}

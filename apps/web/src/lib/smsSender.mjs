function getStringProp(obj, key) {
  if (!obj || typeof obj !== "object") return null;
  return typeof obj[key] === "string" ? obj[key] : null;
}

export async function sendSms({
  to,
  body,
  env,
  fetchFn = fetch,
}) {
  if (env?.SMS_PROVIDER !== "twilio") {
    throw new Error("Unsupported SMS provider");
  }

  const accountSid = String(env.TWILIO_ACCOUNT_SID ?? "").trim();
  const authToken = String(env.TWILIO_AUTH_TOKEN ?? "").trim();
  const messagingServiceSid = String(env.TWILIO_MESSAGING_SERVICE_SID ?? "").trim();
  if (!accountSid || !authToken || !messagingServiceSid) {
    throw new Error("Missing Twilio SMS env");
  }

  const response = await fetchFn(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        MessagingServiceSid: messagingServiceSid,
        To: to,
        Body: body,
      }).toString(),
    },
  );

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = getStringProp(json, "message") ?? `SMS send failed: ${response.status}`;
    throw new Error(message);
  }

  return {
    provider: "twilio",
    providerMessageId: getStringProp(json, "sid"),
  };
}

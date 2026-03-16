import test from "node:test";
import assert from "node:assert/strict";

import { sendSms } from "../src/lib/smsSender.mjs";

test("sendSms posts a Twilio Messages request with form-encoded body", async () => {
  /** @type {{ url?: string, init?: any }} */
  const call = {};

  const result = await sendSms({
    to: "+16195551234",
    body: "Your ASGC code is 123456.",
    env: {
      SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "token-123",
      TWILIO_MESSAGING_SERVICE_SID: "MG123",
    },
    fetchFn: async (url, init) => {
      call.url = url;
      call.init = init;
      return {
        ok: true,
        json: async () => ({ sid: "SM123" }),
      };
    },
  });

  assert.equal(result.provider, "twilio");
  assert.equal(result.providerMessageId, "SM123");
  assert.equal(call.url, "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers.Authorization, `Basic ${Buffer.from("AC123:token-123").toString("base64")}`);
  assert.equal(call.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.match(String(call.init.body), /MessagingServiceSid=MG123/);
  assert.match(String(call.init.body), /To=%2B16195551234/);
});

test("sendSms throws a provider error when Twilio rejects the request", async () => {
  await assert.rejects(
    sendSms({
      to: "+16195551234",
      body: "Your ASGC code is 123456.",
      env: {
        SMS_PROVIDER: "twilio",
        TWILIO_ACCOUNT_SID: "AC123",
        TWILIO_AUTH_TOKEN: "token-123",
        TWILIO_MESSAGING_SERVICE_SID: "MG123",
      },
      fetchFn: async () => ({
        ok: false,
        status: 400,
        json: async () => ({ message: "The 'To' number is not a valid phone number." }),
      }),
    }),
    /valid phone number/i,
  );
});

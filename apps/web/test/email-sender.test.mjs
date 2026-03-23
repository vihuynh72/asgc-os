import test from "node:test";
import assert from "node:assert/strict";

import { sendEmail } from "../src/lib/email-sender.mjs";

test("sendEmail posts both html and text bodies to Resend when html is provided", async () => {
  /** @type {{ url?: string, init?: any }} */
  const call = {};

  const result = await sendEmail({
    to: "member@gcccd.edu",
    subject: "ASGC OS sign-in code",
    text: "Your code is 123456.",
    html: "<strong>123456</strong>",
    env: {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "ASGC <hello@asgc.app>",
      RESEND_API_KEY: "re_test_123",
    },
    fetchFn: async (url, init) => {
      call.url = url;
      call.init = init;
      return {
        ok: true,
        json: async () => ({ id: "email_123" }),
      };
    },
  });

  assert.equal(result.provider, "resend");
  assert.equal(result.providerMessageId, "email_123");
  assert.equal(call.url, "https://api.resend.com/emails");
  const body = JSON.parse(String(call.init.body));
  assert.equal(body.subject, "ASGC OS sign-in code");
  assert.equal(body.text, "Your code is 123456.");
  assert.equal(body.html, "<strong>123456</strong>");
});

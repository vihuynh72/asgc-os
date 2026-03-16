import test from "node:test";
import assert from "node:assert/strict";

import { getPrivacyPolicyContent } from "../src/lib/privacy-policy.mjs";

test("getPrivacyPolicyContent discloses member-only kiosk SMS usage", () => {
  const content = getPrivacyPolicyContent();
  const smsSection = content.sections.find((section) => section.id === "text-messaging");

  assert.equal(content.title, "Privacy Policy");
  assert.match(content.description, /privacy/i);
  assert.ok(smsSection);
  assert.match(smsSection.title, /text messaging/i);
  assert.ok(
    smsSection.paragraphs.some((paragraph) =>
      /one-time verification codes/i.test(paragraph) && /office-hours reminder texts/i.test(paragraph),
    ),
  );
  assert.ok(
    smsSection.paragraphs.some((paragraph) =>
      /only registered ASGC members/i.test(paragraph) && /approved phone/i.test(paragraph),
    ),
  );
  assert.ok(
    smsSection.paragraphs.some((paragraph) =>
      /members of the public do not receive these texts/i.test(paragraph),
    ),
  );
});

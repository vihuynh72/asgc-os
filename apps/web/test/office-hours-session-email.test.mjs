import test from "node:test";
import assert from "node:assert/strict";

import { buildOfficeHoursSessionEmail } from "../src/lib/office-hours-session-email.mjs";

test("buildOfficeHoursSessionEmail formats recurring checkout reminder emails with elapsed time and auto-close time", () => {
  const email = buildOfficeHoursSessionEmail({
    type: "office_hours.session_checkout_reminder",
    origin: "https://asgc.app",
    metadata: {
      elapsed_minutes: 125,
      checkin_at_local: "2026-03-22 10:00",
      auto_close_at_local: "2026-03-22 18:00",
      office_tz: "America/Los_Angeles",
    },
  });

  assert.equal(email.subject, "Your office hours session is still open");
  assert.match(email.text, /2h 5m/);
  assert.match(email.text, /2026-03-22 10:00/);
  assert.match(email.text, /2026-03-22 18:00/);
  assert.match(email.text, /https:\/\/asgc\.app\/office-hours/);
  assert.match(email.html, /2h 5m/);
  assert.match(email.html, /Keep your session accurate/i);
});

test("buildOfficeHoursSessionEmail formats the 15-minute auto-close warning", () => {
  const email = buildOfficeHoursSessionEmail({
    type: "office_hours.session_auto_close_soon",
    origin: "https://asgc.app",
    metadata: {
      minutes_remaining: 15,
      checkin_at_local: "2026-03-22 10:00",
      auto_close_at_local: "2026-03-22 18:00",
      office_tz: "America/Los_Angeles",
    },
  });

  assert.equal(email.subject, "Your office hours session will auto-close soon");
  assert.match(email.text, /15 minutes/i);
  assert.match(email.text, /2026-03-22 18:00/);
  assert.match(email.html, /15 minutes/i);
  assert.match(email.html, /auto-close/i);
});

test("buildOfficeHoursSessionEmail formats auto-closed notices with html and text", () => {
  const email = buildOfficeHoursSessionEmail({
    type: "office_hours.session_auto_closed",
    origin: "https://asgc.app",
    metadata: {
      checkin_at_local: "2026-03-22 10:00",
      checkout_at_local: "2026-03-22 18:00",
      office_tz: "America/Los_Angeles",
    },
  });

  assert.equal(email.subject, "Your office hours session was auto-closed");
  assert.match(email.text, /2026-03-22 10:00/);
  assert.match(email.text, /2026-03-22 18:00/);
  assert.match(email.html, /auto-closed/i);
  assert.match(email.html, /https:\/\/asgc\.app\/office-hours/);
});

test("buildOfficeHoursSessionEmail keeps legacy session_open_long rows compatible during rollout", () => {
  const email = buildOfficeHoursSessionEmail({
    type: "office_hours.session_open_long",
    origin: "https://asgc.app",
    metadata: {
      elapsed_minutes: 60,
      checkin_at_local: "2026-03-22 10:00",
      auto_close_at_local: "2026-03-22 18:00",
      office_tz: "America/Los_Angeles",
    },
  });

  assert.equal(email.subject, "Your office hours session is still open");
  assert.match(email.text, /1h 0m/);
  assert.match(email.html, /2026-03-22 18:00/);
});

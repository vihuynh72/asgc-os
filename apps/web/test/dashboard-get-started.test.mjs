import test from "node:test";
import assert from "node:assert/strict";

import { shouldShowDashboardGetStarted } from "../src/lib/dashboard-get-started.mjs";

test("shouldShowDashboardGetStarted returns true for brand new user", () => {
  assert.equal(shouldShowDashboardGetStarted({ totalMinutes: 0, dismissed: false }), true);
});

test("shouldShowDashboardGetStarted returns false after hours logged", () => {
  assert.equal(shouldShowDashboardGetStarted({ totalMinutes: 30, dismissed: false }), false);
});

test("shouldShowDashboardGetStarted returns false when dismissed", () => {
  assert.equal(shouldShowDashboardGetStarted({ totalMinutes: 0, dismissed: true }), false);
});


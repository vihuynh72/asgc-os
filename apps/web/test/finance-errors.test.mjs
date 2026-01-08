import test from "node:test";
import assert from "node:assert/strict";

import { formatFinanceErrorMessage } from "../src/lib/finance-errors.mjs";

test("formatFinanceErrorMessage maps funding_request_not_ready_for_vote", () => {
  assert.equal(
    formatFinanceErrorMessage("funding_request_not_ready_for_vote"),
    "That funding request must be scheduled for vote before you can record a board vote."
  );
});

test("formatFinanceErrorMessage maps forbidden", () => {
  assert.equal(formatFinanceErrorMessage("forbidden"), "You do not have permission to complete this action.");
});

test("formatFinanceErrorMessage passes through unknown messages", () => {
  assert.equal(formatFinanceErrorMessage("something_weird"), "something_weird");
});


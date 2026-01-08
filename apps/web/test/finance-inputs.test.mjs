import test from "node:test";
import assert from "node:assert/strict";

import { parseFiscalYearInput, sanitizeFiscalYearInput } from "../src/lib/finance-inputs.mjs";

test("sanitizeFiscalYearInput strips non-digits and limits length", () => {
  assert.equal(sanitizeFiscalYearInput("202a6"), "2026");
  assert.equal(sanitizeFiscalYearInput("20 26"), "2026");
  assert.equal(sanitizeFiscalYearInput("2026123"), "2026");
  assert.equal(sanitizeFiscalYearInput(null), "");
});

test("parseFiscalYearInput returns a number for valid years", () => {
  assert.equal(parseFiscalYearInput("2026"), 2026);
  assert.equal(parseFiscalYearInput("2026foo"), 2026);
});

test("parseFiscalYearInput returns null for invalid years", () => {
  assert.equal(parseFiscalYearInput("1999"), null);
  assert.equal(parseFiscalYearInput("20"), null);
  assert.equal(parseFiscalYearInput(""), null);
});


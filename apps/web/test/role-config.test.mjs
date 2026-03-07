import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_WEEKLY_TOTAL_HOURS_BY_ROLE,
  EXECUTIVE_DISPLAY_TITLES,
  inferExecutiveDisplayTitleFromEmail,
  TERM_ROLE_KEYS,
} from "../src/lib/role-config.mjs";

test("term role keys exclude director", () => {
  assert.deepEqual(TERM_ROLE_KEYS, ["president", "executive", "board_member", "volunteer"]);
});

test("default weekly totals match the simplified governance model", () => {
  assert.equal(DEFAULT_WEEKLY_TOTAL_HOURS_BY_ROLE.president, 10);
  assert.equal(DEFAULT_WEEKLY_TOTAL_HOURS_BY_ROLE.executive, 10);
  assert.equal(DEFAULT_WEEKLY_TOTAL_HOURS_BY_ROLE.board_member, 4);
  assert.equal(DEFAULT_WEEKLY_TOTAL_HOURS_BY_ROLE.volunteer, 0);
});

test("executive display titles support the current office mapping", () => {
  assert.deepEqual(EXECUTIVE_DISPLAY_TITLES, ["Executive Vice President", "Director of Board Affairs"]);
  assert.equal(
    inferExecutiveDisplayTitleFromEmail("asgc.execvp@gcccd.edu"),
    "Executive Vice President",
  );
  assert.equal(
    inferExecutiveDisplayTitleFromEmail("asgc.dirboardaffairs@gcccd.edu"),
    "Director of Board Affairs",
  );
});

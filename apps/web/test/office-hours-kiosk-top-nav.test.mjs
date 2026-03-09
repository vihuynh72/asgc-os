import test from "node:test";
import assert from "node:assert/strict";

import { getKioskTopNavModel } from "../src/lib/office-hours-kiosk/top-nav.mjs";

test("getKioskTopNavModel keeps the kiosk nav compact and task-specific", () => {
  assert.deepEqual(getKioskTopNavModel(), {
    homeHref: "/",
    brandMark: "AS",
    brandLabel: "ASGC OS",
    pageLabel: "Office Hours",
    action: {
      href: "/login",
      label: "Sign in",
    },
  });
});

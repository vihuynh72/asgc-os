import test from "node:test";
import assert from "node:assert/strict";

import { buildKioskPhotoQuarantinePath, getFileExtFromPath } from "../src/lib/office-hours-kiosk-photo.mjs";

test("getFileExtFromPath returns lowercased extension", () => {
  assert.equal(getFileExtFromPath("kiosk-checkins/u/abc.JPG"), "jpg");
  assert.equal(getFileExtFromPath("noext"), null);
});

test("buildKioskPhotoQuarantinePath builds deterministic quarantine path", () => {
  const path = buildKioskPhotoQuarantinePath({
    userId: "00000000-0000-0000-0000-000000000000",
    checkinAtIso: "2026-02-01T12:34:56.789Z",
    sessionId: "11111111-1111-1111-1111-111111111111",
    ext: "jpg",
  });
  assert.equal(
    path,
    "kiosk-quarantine/00000000-0000-0000-0000-000000000000/2026-02-01T12-34-56-789Z-11111111-1111-1111-1111-111111111111.jpg",
  );
});


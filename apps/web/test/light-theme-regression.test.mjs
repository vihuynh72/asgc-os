import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const appRoot = join(import.meta.dirname, "..", "src", "app");

test("globals.css locks the app to a white light-only canvas", () => {
  const css = readFileSync(join(appRoot, "globals.css"), "utf8");

  assert.match(css, /color-scheme:\s*light;/);
  assert.doesNotMatch(css, /prefers-color-scheme:\s*dark/);
  assert.match(css, /:root\s*\{[\s\S]*--background:\s*#ffffff;/);
  assert.match(css, /html\[data-kiosk="true"\]\s*body\s*\{[\s\S]*background:\s*#ffffff;/);
});

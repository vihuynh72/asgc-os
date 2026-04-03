import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("birthday page exports an obscure secret path and exact gift URL", async () => {
  const birthday = await import("../src/lib/birthday/alessandra-birthday.mjs");

  assert.deepEqual(Object.keys(birthday).sort(), ["ALESSANDRA_BIRTHDAY_GIFT_URL", "ALESSANDRA_BIRTHDAY_PATH"]);
  assert.equal(birthday.ALESSANDRA_BIRTHDAY_PATH, "/s/73d4-k9x2m-v8q1p-n4r7");
  assert.equal(
    birthday.ALESSANDRA_BIRTHDAY_GIFT_URL,
    "https://claude.ai/gift/redeem?code=73d47361-b0c1-48a6-8319-d09f2323c4bd",
  );
  assert.ok(birthday.ALESSANDRA_BIRTHDAY_PATH.startsWith("/s/"));
  assert.doesNotMatch(birthday.ALESSANDRA_BIRTHDAY_PATH, /alessandra|birthday|bday|20/i);
});

test("birthday page keeps only the new local meme asset set", () => {
  const memeDir = join(import.meta.dirname, "..", "public", "birthday", "alessandra-20");
  const files = readdirSync(memeDir).filter((file) => !file.startsWith(".")).sort();

  assert.deepEqual(files, ["alessandra.png", "bad-bunny-grammys.webp", "crazy-squidward.jpg"]);
});

test("birthday page story uses the cleaned asset set and rewritten voice", () => {
  const storySource = readFileSync(
    join(import.meta.dirname, "..", "src", "components", "birthday", "alessandra-mobile-story.tsx"),
    "utf8",
  );

  assert.match(storySource, /Happy 20th, Alessandra\./);
  assert.match(storySource, /You being 20 is actually rude\./);
  assert.match(storySource, /Caught in 4k\./);
  assert.match(storySource, /You show up for your people\./);
  assert.match(storySource, /\/birthday\/alessandra-20\/bad-bunny-grammys\.webp/);
  assert.match(storySource, /\/birthday\/alessandra-20\/crazy-squidward\.jpg/);
  assert.match(storySource, /\/birthday\/alessandra-20\/alessandra\.png/);
  assert.doesNotMatch(storySource, /motion\.section|whileInView|useReducedMotion/);
  assert.doesNotMatch(storySource, /respectful way|for one second i am being serious|you are literally impossible to outdo/);
});

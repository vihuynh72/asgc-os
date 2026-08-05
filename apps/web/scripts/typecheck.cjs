/* eslint-disable @typescript-eslint/no-require-imports */
const { rmSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const appRoot = path.resolve(__dirname, "..");

// Next.js recommends generating route types before standalone TypeScript checks.
// Clear only generated type directories first so deleted routes cannot leave stale declarations.
rmSync(path.join(appRoot, ".next", "types"), { recursive: true, force: true });
rmSync(path.join(appRoot, ".next", "dev", "types"), { recursive: true, force: true });

function runNodeCli(moduleId, args) {
  const cliPath = require.resolve(moduleId, { paths: [appRoot] });
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: appRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runNodeCli("next/dist/bin/next", ["typegen"]);
runNodeCli("typescript/bin/tsc", ["-p", "tsconfig.json", "--noEmit", "--incremental", "false"]);

// Every test here runs the real scripts/main.js inside a vm with the handful of
// Foundry globals it touches mocked, so the thing under test is the shipped file
// and not a copy of it. Each test was checked by deliberately breaking the code
// first: a test that passes against a broken module is not a test.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
let bad = 0;
for (const f of ["seats.mjs", "carrying.mjs"]) {
  console.log(`\n--- ${f}`);
  const r = spawnSync(process.execPath, [path.join(here, f)], { stdio: "inherit" });
  if (r.status !== 0) bad++;
}
process.exit(bad ? 1 : 0);

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const rootScript = join(repoRoot, "scripts/vercel-build.mjs");

if (!existsSync(rootScript)) {
  console.error(`Missing Vercel build script: ${rootScript}`);
  process.exit(1);
}

const build = spawnSync(process.execPath, [rootScript], {
  cwd: repoRoot,
  stdio: "inherit",
});
process.exit(build.status ?? 1);

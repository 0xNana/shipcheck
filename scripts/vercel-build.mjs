import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const startCwd = process.cwd();

function findWorkspaceRoot(start) {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) {
      return start;
    }
    dir = parent;
  }
}

const root = findWorkspaceRoot(startCwd);
console.log(
  JSON.stringify({
    event: "vercel.build.start",
    startCwd,
    workspaceRoot: root,
  }),
);

const build = spawnSync("pnpm", ["--filter", "@shipcheck/web...", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const webDist = join(root, "apps/web/dist");
if (!existsSync(join(webDist, "index.html"))) {
  console.error(`Missing web build output: ${webDist}/index.html`);
  process.exit(1);
}

// Cover Root Directory = repo root or apps/web, and Output Directory =
// apps/web/dist | dist | vercel-out.
const outputs = [
  join(root, "apps/web/dist"),
  join(root, "dist"),
  join(root, "vercel-out"),
  join(startCwd, "dist"),
  join(startCwd, "vercel-out"),
];

for (const out of new Set(outputs)) {
  if (out === webDist) {
    continue;
  }
  rmSync(out, { recursive: true, force: true });
  cpSync(webDist, out, { recursive: true });
  console.log(`Copied web build -> ${out}`);
}

console.log(
  JSON.stringify({
    event: "vercel.build.done",
    webDist,
  }),
);

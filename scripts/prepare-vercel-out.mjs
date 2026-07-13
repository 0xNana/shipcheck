import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const candidates = ["apps/web/dist", "dist"].map((path) => resolve(path));
const source = candidates.find((path) => existsSync(path));

if (source === undefined) {
  console.error(
    "ShipCheck Vercel prepare: no web build output found. Looked for:",
    candidates.join(", "),
  );
  process.exit(1);
}

const out = resolve("vercel-out");
rmSync(out, { recursive: true, force: true });
cpSync(source, out, { recursive: true });
console.log(`ShipCheck Vercel prepare: copied ${source} -> ${out}`);

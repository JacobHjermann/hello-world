// Copies the shared search logic into the Chrome extension, so both use exactly the same code.
// Run after changing anything in src/: npm run build:extension
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SHARED = ["src/search.js", "src/airports.js", "src/messages.js", "src/scheduler.js", "src/providers/demo.js", "public/styles.css", "public/scenes.js"];

const out = path.join(root, "extension", "shared");
const check = process.argv.includes("--check");
let stale = [];
for (const f of SHARED) {
  const from = path.join(root, f);
  const to = path.join(out, f.replace(/^(src|public)\//, ""));
  if (check) {
    let same = false;
    try { same = readFileSync(from, "utf8") === readFileSync(to, "utf8"); } catch {}
    if (!same) stale.push(f);
    continue;
  }
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
}
if (check && stale.length) {
  console.error(`extension/shared er utdatert (${stale.join(", ")}). Kjør: npm run build:extension`);
  process.exit(1);
}
if (!check) console.log(`Kopierte ${SHARED.length} filer til extension/shared/`);

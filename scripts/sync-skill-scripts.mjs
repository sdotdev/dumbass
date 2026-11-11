#!/usr/bin/env node
// Copies the canonical mobile renderer into the one skill that ships it, so the skill works when
// installed on its own with only Node. check-bundle-drift.mjs verifies the copies stay identical.
import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "packages", "mobile-renderer", "src");
const target = path.join(root, "skills", "dumbass-mobile-audit", "scripts");
await mkdir(target, { recursive: true });
let count = 0;
for (const name of (await readdir(source)).filter((n) => n.endsWith(".mjs")).sort()) {
  await copyFile(path.join(source, name), path.join(target, name));
  count += 1;
}
await mkdir(path.join(root, "skills", "dumbass-mobile-audit", "references"), { recursive: true });
await copyFile(path.join(root, "protocol", "mobile-rendering.md"), path.join(root, "skills", "dumbass-mobile-audit", "references", "mobile-rendering.md"));
console.log(`synced ${count} renderer scripts and the mobile rendering reference into dumbass-mobile-audit`);

#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist", "portable-skills");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(path.join(root, "skills"), path.join(out, "skills"), { recursive: true });
await cp(path.join(root, "LICENSE"), path.join(out, "LICENSE"));
await cp(path.join(root, "packaging", "portable", "README.md"), path.join(out, "README.md"));
await cp(path.join(root, "scripts", "install.mjs"), path.join(out, "install.mjs"));
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await files(full)); else result.push(full);
  }
  return result;
}
const manifest = {};
for (const file of (await files(out)).sort()) {
  const relative = path.relative(out, file).split(path.sep).join("/");
  manifest[relative] = createHash("sha256").update(await readFile(file)).digest("hex");
}
await writeFile(path.join(out, "SHA256SUMS.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`packaged ${Object.keys(manifest).length} files in ${out}`);

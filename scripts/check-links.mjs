#!/usr/bin/env node
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set(["node_modules", ".git", "dist"]);
async function markdownFiles(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await markdownFiles(full));
    else if (entry.name.endsWith(".md")) result.push(full);
  }
  return result;
}
const failures = [];
const files = await markdownFiles(root);
for (const file of files) {
  const body = await readFile(file, "utf8");
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const destination = match[1].trim();
    if (!destination || /^(https?:|mailto:|#)/.test(destination)) continue;
    const relative = destination.split("#")[0].replace(/^<|>$/g, "");
    try { await access(path.resolve(path.dirname(file), decodeURIComponent(relative))); }
    catch { failures.push(`${path.relative(root, file)} -> ${destination}`); }
  }
}
if (failures.length) throw new Error(`Broken Markdown links:\n${failures.join("\n")}`);
console.log(`checked local links in ${files.length} Markdown files`);

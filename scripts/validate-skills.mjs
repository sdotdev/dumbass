#!/usr/bin/env node
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(root, "skills");
const entries = (await readdir(skillsRoot, { withFileTypes: true })).filter((e) => e.isDirectory());
if (!entries.length) throw new Error("No skills found");
const failures = [];
for (const entry of entries) {
  const file = path.join(skillsRoot, entry.name, "SKILL.md");
  let body;
  try { body = await readFile(file, "utf8"); } catch { failures.push(`${entry.name}: missing SKILL.md`); continue; }
  if (!body.startsWith("---\n")) failures.push(`${entry.name}: missing YAML frontmatter`);
  const frontmatter = body.split("---", 3)[1] ?? "";
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (name !== entry.name) failures.push(`${entry.name}: frontmatter name is ${name ?? "missing"}`);
  if (!description) failures.push(`${entry.name}: missing description`);
  for (const match of body.matchAll(/\[[^\]]+\]\((?!https?:|#)([^)]+)\)/g)) {
    const linked = match[1].split("#")[0];
    if (!linked) continue;
    try { await access(path.resolve(path.dirname(file), linked)); } catch { failures.push(`${entry.name}: broken link ${match[1]}`); }
  }
}
if (failures.length) throw new Error(`Skill validation failed:\n${failures.join("\n")}`);
console.log(`validated ${entries.length} skills`);

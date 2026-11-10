#!/usr/bin/env node
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(root, "skills");
const entries = (await readdir(skillsRoot, { withFileTypes: true })).filter((e) => e.isDirectory());
if (!entries.length) throw new Error("No skills found");
const skillNames = new Set(entries.map((e) => e.name));

// Limits follow the Agent Skills format and the skill-creator validator, so a skill that passes here also loads in other hosts.
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
const MAX_COMPATIBILITY = 500;
const MAX_BODY_LINES = 500;
const ALLOWED_KEYS = new Set(["name", "description", "license", "allowed-tools", "metadata", "compatibility"]);

const failures = [];
for (const entry of entries) {
  const file = path.join(skillsRoot, entry.name, "SKILL.md");
  const fail = (message) => failures.push(`${entry.name}: ${message}`);
  let body;
  try { body = await readFile(file, "utf8"); } catch { fail("missing SKILL.md"); continue; }
  if (!body.startsWith("---\n")) { fail("missing YAML frontmatter"); continue; }
  const frontmatter = body.split("---", 3)[1] ?? "";
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (name !== entry.name) fail(`frontmatter name is ${name ?? "missing"}`);
  if (name && (!/^[a-z0-9-]+$/.test(name) || name.startsWith("-") || name.endsWith("-") || name.includes("--") || name.length > MAX_NAME)) fail("name must be kebab-case, at most 64 characters");
  if (!description) fail("missing description");
  else {
    // A description that is not a single-line plain scalar is parsed differently by different hosts.
    if (/^["'>|]/.test(description)) fail("description must be a plain single-line value, not quoted or block style");
    if (/: |\s#/.test(description)) fail("description contains ': ' or ' #', which YAML parsers treat as syntax");
    if (/[<>]/.test(description)) fail("description must not contain angle brackets");
    if (description.length > MAX_DESCRIPTION) fail(`description is ${description.length} characters; the maximum is ${MAX_DESCRIPTION}`);
    if (description.length < 120) fail("description is too short to say what the skill does and when to use it");
  }
  const compatibility = frontmatter.match(/^compatibility:\s*(.+)$/m)?.[1]?.trim();
  if (compatibility && compatibility.length > MAX_COMPATIBILITY) fail(`compatibility is longer than ${MAX_COMPATIBILITY} characters`);
  for (const key of frontmatter.matchAll(/^([A-Za-z][\w-]*):/gm)) if (!ALLOWED_KEYS.has(key[1])) fail(`unexpected frontmatter key ${key[1]}`);
  if (!/^\s+version:\s*"\d+\.\d+\.\d+"$/m.test(frontmatter)) fail("metadata.version must be a quoted semantic version");
  if (body.split("\n").length > MAX_BODY_LINES) fail(`SKILL.md exceeds ${MAX_BODY_LINES} lines; move detail into references/`);
  for (const match of body.matchAll(/\[[^\]]+\]\((?!https?:|#)([^)]+)\)/g)) {
    const linked = match[1].split("#")[0];
    if (!linked) continue;
    try { await access(path.resolve(path.dirname(file), linked)); } catch { fail(`broken link ${match[1]}`); }
  }
  // Routing text names sibling skills; a typo there silently sends users to a skill that does not exist.
  for (const match of body.matchAll(/(?<![.\w/-])dumbass-[a-z]+(?:-[a-z]+)*\b/g)) {
    if (!skillNames.has(match[0])) fail(`refers to unknown skill ${match[0]}`);
  }
}
if (failures.length) throw new Error(`Skill validation failed:\n${failures.join("\n")}`);
console.log(`validated ${entries.length} skills`);

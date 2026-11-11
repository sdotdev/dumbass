#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skills = (await readdir(path.join(root, "skills"), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
const mappings = [
  ["protocol/schemas", "assets/schemas"],
  ["protocol/profiles", "assets/profiles"],
  ["protocol/personas", "assets/personas"],
];
const directFiles = [
  ["protocol/ux-principles.md", "references/ux-principles.md"],
  ["protocol/templates/report.md", "assets/report-template.md"],
  ["protocol/templates/remediation.md", "assets/remediation-template.md"],
];
// Skills that carry extra canonical material beyond the shared contracts.
// Playbooks are fix strategy and verification guidance, so only the planner and implementer bundle them.
const playbookSkills = new Set(["dumbass-remediate", "dumbass-fix"]);
const playbookNames = (await readdir(path.join(root, "playbooks"))).filter(name => name.endsWith(".md")).sort();
// The mobile audit skill ships the renderer scripts and the mobile rendering reference so it works on its own.
const mobileSkill = "dumbass-mobile-audit";
const rendererSources = (await readdir(path.join(root, "packages", "mobile-renderer", "src"))).filter(name => name.endsWith(".mjs")).sort();
const failures = [];
for (const skill of skills) {
  const comparisons = [...directFiles.map(([canonical, bundled]) => [canonical, `skills/${skill}/${bundled}`])];
  if (skill === mobileSkill) {
    comparisons.push(["protocol/mobile-rendering.md", `skills/${skill}/references/mobile-rendering.md`]);
    for (const name of rendererSources) comparisons.push([`packages/mobile-renderer/src/${name}`, `skills/${skill}/scripts/${name}`]);
  }
  if (playbookSkills.has(skill)) for (const name of playbookNames) comparisons.push([`playbooks/${name}`, `skills/${skill}/assets/playbooks/${name}`]);
  for (const [canonicalDir, bundledDir] of mappings) {
    for (const name of await readdir(path.join(root, canonicalDir))) comparisons.push([`${canonicalDir}/${name}`, `skills/${skill}/${bundledDir}/${name}`]);
  }
  for (const [canonical, skillBundled] of comparisons) {
    try {
      if (!Buffer.from(await readFile(path.join(root, canonical))).equals(Buffer.from(await readFile(path.join(root, skillBundled))))) failures.push(`${skillBundled} differs from ${canonical}`);
    } catch (error) { failures.push(`${skillBundled}: ${error.code ?? error.message}`); }
  }
}
if (skills.includes(mobileSkill)) {
  for (const name of await readdir(path.join(root, "skills", mobileSkill, "scripts"))) if (!rendererSources.includes(name)) failures.push(`skills/${mobileSkill}/scripts/${name} has no canonical source in packages/mobile-renderer/src`);
}
if (failures.length) throw new Error(`Bundled contract drift:\n${failures.join("\n")}`);
console.log(`verified canonical contract copies across ${skills.length} skills`);

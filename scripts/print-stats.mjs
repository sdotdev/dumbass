#!/usr/bin/env node
// Prints the numbers quoted in the README, computed from the repository itself, so they cannot be
// invented or quietly go stale. `npm run stats` prints the static counts; add --tests to also run
// the suites and sum their results (slower).
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const names = async (dir, filter) => (await readdir(path.join(root, dir))).filter(filter);

export async function staticStats() {
  const skills = await names("skills", (n) => !n.startsWith("."));
  const schemas = await names("protocol/schemas", (n) => n.endsWith(".schema.json"));
  const profiles = await names("protocol/profiles", (n) => n.endsWith(".json"));
  const personas = await names("protocol/personas", (n) => n.endsWith(".json"));
  const playbooks = await names("playbooks", (n) => n.endsWith(".md"));
  const principles = (await readFile(path.join(root, "protocol/ux-principles.md"), "utf8")).match(/^\| `[a-z-]+` \|/gm)?.length ?? 0;
  const severities = (await readFile(path.join(root, "protocol/severity/rubric.md"), "utf8")).match(/^\| (critical|high|medium|low) \|/gm)?.length ?? 0;
  const errorCodes = (await json("protocol/schemas/event.schema.json")).properties.error_code.enum.length;
  const tasks = (await json("evals/cases/tasks.json")).cases;
  const contracts = await import(pathToFileURL(path.join(root, "packages/mobile-renderer/src/contracts.mjs")).href);
  const behaviorCases = await names("evals/skill-cases", (n) => !n.endsWith(".md"));
  let assertions = 0;
  for (const c of behaviorCases) assertions += (await readdir(path.join(root, "evals/skill-cases", c, "graders"))).length;
  return {
    skills: skills.length,
    protocolSchemas: schemas.length,
    profiles: profiles.length,
    personas: personas.length,
    playbooks: playbooks.length,
    uxPrinciples: principles,
    severityLevels: severities,
    errorCodes,
    fixtureCases: tasks.length,
    fixtureSplits: [...new Set(tasks.map((t) => t.split))].length,
    mobilePlatforms: contracts.PLATFORMS.length,
    captureMethods: contracts.METHOD_IDS.length,
    classifications: contracts.CLASSIFICATIONS.length,
    behaviorCases: behaviorCases.length,
    behaviorAssertions: assertions,
  };
}

export async function testStats() {
  let output = "";
  try {
    ({ stdout: output } = await exec("npm", ["test"], { cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 600_000 }));
  } catch (error) {
    output = error.stdout ?? "";
  }
  const sum = (key) => [...output.matchAll(new RegExp(`^# ${key} (\\d+)`, "gm"))].reduce((n, m) => n + Number(m[1]), 0);
  return { tests: sum("tests"), passed: sum("pass"), failed: sum("fail") };
}

/** Compares the README's "By the numbers" table with a fresh count, including the test total. */
export async function checkReadme() {
  const readme = await readFile(path.join(root, "README.md"), "utf8");
  const rows = [...readme.matchAll(/^\| \*\*(\d+)\*\* \| (.+) \|$/gm)].map((m) => ({ n: Number(m[1]), text: m[2] }));
  const stats = { ...(await staticStats()), ...(await testStats()) };
  const expected = [
    [stats.skills, /^skills:/], [stats.mobilePlatforms, /^mobile targets:/], [stats.captureMethods, /^capture methods/],
    [stats.classifications, /^evidence classifications/], [stats.uxPrinciples, /^UX principles/], [stats.severityLevels, /^severity levels/],
    [stats.protocolSchemas, /^machine-checked protocol schemas/], [stats.errorCodes, /^named failure codes/],
    [stats.fixtureCases, /^deterministic fixture cases/], [stats.behaviorAssertions, /^assertions in the skill behavior cases/],
    [stats.tests, /^automated tests/],
  ];
  const problems = [];
  for (const [value, label] of expected) {
    const row = rows.find((r) => label.test(r.text));
    if (!row) problems.push(`README has no row matching ${label}`);
    else if (row.n !== value) problems.push(`README says ${row.n} for "${row.text}" but the repository has ${value}`);
  }
  if (stats.failed > 0) problems.push(`${stats.failed} test(s) failed while recounting`);
  return { ok: problems.length === 0, problems, stats };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (process.argv.includes("--check")) {
    const result = await checkReadme();
    console.log(JSON.stringify({ ok: result.ok, problems: result.problems }, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } else {
    const stats = await staticStats();
    if (process.argv.includes("--tests")) Object.assign(stats, await testStats());
    console.log(JSON.stringify(stats, null, 2));
  }
}

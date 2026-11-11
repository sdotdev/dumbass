import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { staticStats } from "../scripts/print-stats.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readme = await readFile(path.join(root, "README.md"), "utf8");
const prose = readme.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");

test("the numbers in the README are the numbers in the repository", async () => {
  const stats = await staticStats();
  // Each row of the "By the numbers" table is: | **N** | text
  const rows = [...readme.matchAll(/^\| \*\*(\d+)\*\* \| (.+) \|$/gm)].map((m) => ({ n: Number(m[1]), text: m[2] }));
  const expected = [
    [stats.skills, /^skills:/],
    [stats.mobilePlatforms, /^mobile targets:/],
    [stats.captureMethods, /^capture methods/],
    [stats.classifications, /^evidence classifications/],
    [stats.uxPrinciples, /^UX principles/],
    [stats.severityLevels, /^severity levels/],
    [stats.protocolSchemas, /^machine-checked protocol schemas/],
    [stats.errorCodes, /^named failure codes/],
    [stats.fixtureCases, /^deterministic fixture cases/],
    [stats.behaviorAssertions, /^assertions in the skill behavior cases/],
  ];
  for (const [value, label] of expected) {
    const row = rows.find((r) => label.test(r.text));
    assert.ok(row, `README is missing the row ${label}`);
    assert.equal(row.n, value, `README says ${row.n} for "${row.text}" but the repository has ${value}`);
  }
  assert.match(readme, new RegExp(`across \\*\\*${stats.fixtureSplits}\\*\\* splits`), "fixture split count");
  assert.ok(rows.some((r) => /^automated tests/.test(r.text)), "the test count row exists (recount with npm run stats -- --tests)");
});

test("every image the README embeds exists and is a sensible size", async () => {
  const sources = [...readme.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
  assert.ok(sources.length >= 2, "the README shows real output");
  for (const source of sources) {
    const info = await stat(path.join(root, source));
    assert.ok(info.size > 1000 && info.size < 300_000, `${source} is ${info.size} bytes`);
  }
});

test("every npm script and skill the README mentions exists, and every skill is listed", async () => {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  for (const [, script] of readme.matchAll(/npm run ([a-z:-]+)/g)) assert.ok(pkg.scripts[script], `README mentions missing script ${script}`);
  const skills = (await readdir(path.join(root, "skills"))).sort();
  for (const skill of skills) assert.ok(readme.includes(`\`${skill}\``), `README does not list ${skill}`);
  for (const [, name] of readme.matchAll(/`(dumbass-[a-z-]+)`/g)) assert.ok(skills.includes(name), `README names a skill that does not exist: ${name}`);
});

test("the pair is named Dumbass and Smartass in the README, and explained as knowledge, not intelligence", () => {
  assert.match(readme, /\*\*Dumbass\*\*/);
  assert.match(readme, /\*\*Smartass\*\*/);
  assert.match(readme, /About the names/);
  assert.match(readme, /what each tester \*knows about your product\*/);
  assert.match(readme, /No person is ever called either/);
  assert.match(readme, /assigns no intelligence labels to anyone/);
});

test("the README never calls the two testers by their skill-role names outside code", () => {
  assert.doesNotMatch(prose, /\b(novice|expert)s?\b/i);
});

test("the Smartass name stays in the README and docs, never in the skills the agents read", async () => {
  async function walk(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(full)));
      else if (/\.(md|json|mjs)$/.test(entry.name)) out.push(full);
    }
    return out;
  }
  for (const file of await walk(path.join(root, "skills"))) {
    assert.doesNotMatch(await readFile(file, "utf8"), /smartass/i, `${path.relative(root, file)} must not use the README-only name`);
  }
});

test("the quoted fragments are pinned so they are not reworded by accident", () => {
  // They were copied from a recorded run's observations. This pins the wording; it cannot re-verify it against that run.
  for (const fragment of ["I do not know what 'completed reporting snapshot' means for me", "so I can reconcile without a calculator", "a factor of exactly 1,000"]) {
    assert.ok(readme.includes(fragment), `README no longer contains the recorded fragment: ${fragment}`);
  }
});

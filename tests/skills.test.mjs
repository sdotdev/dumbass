import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(root, "skills");
const skills = (await readdir(skillsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();

async function loadAjv() {
  const dir = path.join(root, "protocol", "schemas");
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  for (const name of (await readdir(dir)).filter((n) => n.endsWith(".schema.json"))) ajv.addSchema(JSON.parse(await readFile(path.join(dir, name), "utf8")));
  return ajv;
}

test("every worked-example artifact validates against its protocol schema", async () => {
  const ajv = await loadAjv();
  let checked = 0;
  for (const skill of skills) {
    const text = await readFile(path.join(skillsDir, skill, "references", "example.md"), "utf8");
    for (const match of text.matchAll(/```(json|jsonl) schema=([a-z-]+)\n([\s\S]*?)```/g)) {
      const [, kind, schemaName, body] = match;
      const validate = ajv.getSchema(`https://dumbass.dev/protocol/1.0.0/${schemaName}.schema.json`);
      assert.ok(validate, `${skill}: unknown schema ${schemaName}`);
      const documents = kind === "jsonl" ? body.split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [JSON.parse(body)];
      for (const document of documents) {
        assert.equal(validate(document), true, `${skill} ${schemaName} example is invalid: ${JSON.stringify(validate.errors)}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= skills.length, "each skill should ship at least one machine-checked example");
});

test("playbooks are bundled only with the planner and the implementer", async () => {
  for (const skill of skills) {
    let names = [];
    try { names = (await readdir(path.join(skillsDir, skill, "assets", "playbooks"))).sort(); } catch { /* absent */ }
    if (skill === "dumbass-remediate" || skill === "dumbass-fix") assert.deepEqual(names, ["dashboard.md", "general-web.md", "mobile.md"], `${skill} must bundle the playbooks`);
    else assert.deepEqual(names, [], `${skill} should not carry playbooks`);
  }
});

test("evaluator skills do not load the auditor's rubric or the other persona", async () => {
  // The evaluator should behave like a person, not like a reviewer holding the heuristics list; ranking belongs to the observer.
  for (const [skill, other] of [["dumbass-novice", "expert.json"], ["dumbass-expert", "novice.json"]]) {
    const body = await readFile(path.join(skillsDir, skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(body, /\]\(references\/(severity|ux-principles)\.md\)/, `${skill} must not link the severity rubric or UX principles`);
    assert.doesNotMatch(body, new RegExp(`\\]\\(assets/personas/${other.replace(".", "\\.")}\\)`), `${skill} must not link the other persona card`);
  }
});

test("orchestrators name their siblings so delegation is discoverable", async () => {
  for (const skill of ["dumbass-audit", "dumbass-dashboard-audit", "dumbass-mobile-audit"]) {
    const body = await readFile(path.join(skillsDir, skill, "SKILL.md"), "utf8");
    for (const sibling of ["dumbass-novice", "dumbass-expert", "dumbass-observe"]) assert.match(body, new RegExp(sibling), `${skill} should mention ${sibling}`);
  }
});

async function validatorFailures(mutate) {
  const temp = await mkdtemp(path.join(tmpdir(), "dumbass-validate-"));
  try {
    await mkdir(path.join(temp, "scripts"));
    await cp(path.join(root, "scripts", "validate-skills.mjs"), path.join(temp, "scripts", "validate-skills.mjs"));
    await cp(skillsDir, path.join(temp, "skills"), { recursive: true });
    await mutate(path.join(temp, "skills", "dumbass-audit", "SKILL.md"));
    try { await exec(process.execPath, [path.join(temp, "scripts", "validate-skills.mjs")]); return ""; }
    catch (error) { return `${error.stderr ?? ""}${error.stdout ?? ""}`; }
  } finally { await rm(temp, { recursive: true, force: true }); }
}
const edit = (from, to) => async (file) => writeFile(file, (await readFile(file, "utf8")).replace(from, to));

test("skill validator rejects descriptions that break YAML parsers", async () => {
  assert.match(await validatorFailures(edit("Use whenever someone asks", "Use it: whenever someone asks")), /description contains/);
});
test("skill validator rejects over-long descriptions", async () => {
  assert.match(await validatorFailures(edit("Produces a report only", `${"x".repeat(1100)} Produces a report only`)), /description is \d+ characters/);
});
test("skill validator rejects routing text that names a skill that does not exist", async () => {
  assert.match(await validatorFailures(edit("(dumbass-dashboard-audit, dumbass-mobile-audit)", "(dumbass-dashboard-audit, dumbass-tablet-audit)")), /unknown skill dumbass-tablet-audit/);
});
test("skill validator accepts the shipped skills", async () => {
  assert.equal(await validatorFailures(async () => {}), "");
});

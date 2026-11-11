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

// ---- mobile rendering
test("the mobile audit skill runs on its own when installed with only Node", async () => {
  const target = await mkdtemp(path.join(tmpdir(), "dumbass-mobile-install-"));
  try {
    await exec(process.execPath, [path.join(root, "scripts/install.mjs"), "--target", target, "--skills", "dumbass-mobile-audit"]);
    const cli = path.join(target, "dumbass-mobile-audit", "scripts", "cli.mjs");
    const help = await exec(process.execPath, [cli, "help"]);
    assert.match(JSON.parse(help.stdout).usage, /plan and select never execute anything/);
    const decision = JSON.parse((await exec(process.execPath, [cli, "select", "--platform", "ios", "--framework", "swiftui", "--remote", "declined"])).stdout);
    // On this machine the answer depends on the OS, but it is always a structured decision that starts nothing.
    assert.ok(["ready", "needs-prerequisites", "declined"].includes(decision.status), decision.status);
    assert.equal(decision.remote === null || decision.remote === undefined, true, "a declined remote route never carries a remote plan");
    const schema = JSON.parse(await readFile(path.join(target, "dumbass-mobile-audit", "assets", "schemas", "render-manifest.schema.json"), "utf8"));
    assert.equal(schema.$id, "https://dumbass.dev/protocol/1.0.0/render-manifest.schema.json");
  } finally { await rm(target, { recursive: true, force: true }); }
});

test("only the mobile audit skill carries renderer scripts", async () => {
  for (const skill of skills) {
    let names = [];
    try { names = await readdir(path.join(skillsDir, skill, "scripts")); } catch { /* absent */ }
    if (skill === "dumbass-mobile-audit") assert.ok(names.includes("cli.mjs") && names.includes("evidence.mjs"), "the mobile audit skill must ship its renderer");
    else assert.deepEqual(names, [], `${skill} should not carry scripts`);
  }
});

test("evaluator skills stay free of any renderer knowledge", async () => {
  for (const skill of ["dumbass-novice", "dumbass-expert"]) {
    const body = await readFile(path.join(skillsDir, skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(body, /cli\.mjs|render-manifest|renders\/|swiftui-render|mugshot|paparazzi|classification|evaluator-input/i, `${skill} must not know how screenshots were produced`);
    assert.match(body, /Never uses source, DOM, selectors, console/);
  }
});

test("the mobile audit skill asks before installing, editing or sending code anywhere", async () => {
  const body = await readFile(path.join(skillsDir, "dumbass-mobile-audit", "SKILL.md"), "utf8");
  for (const must of [/ask before installing/i, /needs-consent/, /describe-remote/, /authorize --user-confirmed/, /Agreement to .run the audit. is not agreement to send code anywhere/, /Do not fall back to a different renderer on your own/, /images only/i, /never fabricate a screenshot/i, /Approximate screenshots are withheld/]) {
    assert.match(body, must, String(must));
  }
});

test("the mobile reference states exactly what is implemented and what is only mocked", async () => {
  const text = await readFile(path.join(skillsDir, "dumbass-mobile-audit", "references", "mobile-rendering.md"), "utf8");
  assert.match(text, /Mocked only/);
  assert.match(text, /Never run against live GitHub here/);
  assert.match(text, /Not provided/);
  assert.match(text, /cross-platform-swift-compatible.*\*\*Approximate/s);
});

test("a native mobile run manifest validates with the mobile-native profile, and unknown profiles are still rejected", async () => {
  const ajv = await loadAjv();
  const validate = ajv.getSchema("https://dumbass.dev/protocol/1.0.0/run.schema.json");
  const example = JSON.parse(await readFile(path.join(skillsDir, "dumbass-mobile-audit", "assets", "example-run.json"), "utf8"));
  assert.equal(validate({ ...example, profile: "mobile-native", mode: "static" }), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...example, profile: "mobile-quantum" }), false);
  const profile = JSON.parse(await readFile(path.join(skillsDir, "dumbass-mobile-audit", "assets", "profiles", "mobile-native.json"), "utf8"));
  assert.equal(profile.profile_id, "mobile-native");
  assert.ok(profile.limitations.some((l) => /not a physical device/.test(l)));
});

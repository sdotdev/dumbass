import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Codex plugin manifest resolves the repository skills directory", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.skills, "./skills/");
  assert.deepEqual((await readdir(path.join(root, manifest.skills))).sort(), (await readdir(path.join(root, "skills"))).sort());
});
test("portable installer installs all self-contained skills", async () => {
  const target = await mkdtemp(path.join(tmpdir(), "dumbass-install-"));
  try {
    await exec(process.execPath, [path.join(root, "scripts/install.mjs"), "--target", target]);
    const skills = (await readdir(path.join(root, "skills"))).sort();
    assert.deepEqual((await readdir(target)).sort(), skills);
    for (const skill of skills) assert.match(await readFile(path.join(target, skill, "SKILL.md"), "utf8"), new RegExp(`name:\\s*${skill}`));
  } finally { await rm(target, { recursive: true, force: true }); }
});
test("installer refuses accidental overwrite", async () => {
  const target = await mkdtemp(path.join(tmpdir(), "dumbass-install-"));
  try {
    const command = [path.join(root, "scripts/install.mjs"), "--target", target, "--skills", "dumbass-audit"];
    await exec(process.execPath, command);
    await assert.rejects(exec(process.execPath, command));
  } finally { await rm(target, { recursive: true, force: true }); }
});

test("installer refuses a target that overlaps its source", async () => {
  const sourceSkill = path.join(root, "skills", "dumbass-audit", "SKILL.md");
  await assert.rejects(exec(process.execPath, [path.join(root, "scripts/install.mjs"), "--target", path.join(root, "skills"), "--skills", "dumbass-audit", "--force"]), /overlapping/);
  assert.match(await readFile(sourceSkill, "utf8"), /name:\s*dumbass-audit/);
});

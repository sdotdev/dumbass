import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(root, "dist", "portable-skills");

test("packaged checksums and standalone installer are valid", async () => {
  const manifest = JSON.parse(await readFile(path.join(bundle, "SHA256SUMS.json"), "utf8"));
  for (const [relative, expected] of Object.entries(manifest)) {
    const actual = createHash("sha256").update(await readFile(path.join(bundle, relative))).digest("hex");
    assert.equal(actual, expected, relative);
  }
  const target = await mkdtemp(path.join(tmpdir(), "dumbass-portable-"));
  try {
    await exec(process.execPath, [path.join(bundle, "install.mjs"), "--target", target]);
    assert.deepEqual((await readdir(target)).sort(), (await readdir(path.join(bundle, "skills"))).sort());
  } finally { await rm(target, { recursive: true, force: true }); }
});

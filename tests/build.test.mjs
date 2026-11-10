import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("compiled runner and adapter are importable JavaScript packages", async () => {
  const runner = path.join(root, "packages", "runner", "dist", "index.js");
  const adapter = path.join(root, "packages", "adapter-web", "dist", "index.js");
  await access(runner);
  await access(adapter);
  assert.equal(typeof (await import(pathToFileURL(runner))).VisualRunner, "function");
  assert.equal(typeof (await import(pathToFileURL(adapter))).WebAdapter, "function");
});

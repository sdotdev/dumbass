import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ContractError, assertClassification, classificationFor } from "../src/contracts.mjs";
import {
  addCapture, addFailure, capabilityRecord, collectImages, createManifest, finalizeManifest, isScreenshotOnly, limitationsFor,
  materializeFrames, prepareEvaluatorInput, readImageInfo, sha256Hex, stripImageMetadata, validateRenderManifest, writeManifest,
} from "../src/evidence.mjs";
import { SHA, makePng, makeTree, makeWebp } from "./helpers.mjs";

const schemaDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../protocol/schemas");
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
for (const name of await readdir(schemaDir)) if (name.endsWith(".schema.json")) ajv.addSchema(JSON.parse(await readFile(path.join(schemaDir, name), "utf8")));
const validator = (name) => ajv.getSchema(`https://dumbass.dev/protocol/1.0.0/${name}.schema.json`);

const local = (os, toolchain = null) => ({ location: "local", os, toolchain });
const base = (over = {}) => ({ platform: "ios", framework: "swiftui", method: "swiftui-render", execution: local("macos", "Xcode 16.2"), device: { name: "iPhone preset", width: 2, height: 4, scale_factor: 2 }, theme: "light", projectId: "demo-app", revision: SHA, screenId: "login", ...over });

async function setup(files = {}) {
  const dir = await makeTree({ "login.png": makePng(4, 8), "home.png": makePng(4, 8, { seed: 5 }), ...files });
  const runDir = path.join(dir, "run");
  await mkdir(runDir);
  return { dir, runDir, file: (name) => path.join(dir, name) };
}

// ---- image parsing
test("PNG and WebP headers are read, and anything else is rejected", () => {
  assert.deepEqual(readImageInfo(makePng(30, 50)), { mediaType: "image/png", width: 30, height: 50 });
  assert.deepEqual(readImageInfo(makeWebp({ width: 40, height: 60 })), { mediaType: "image/webp", width: 40, height: 60 });
  assert.deepEqual(readImageInfo(makeWebp({ width: 41, height: 61, kind: "VP8 " })), { mediaType: "image/webp", width: 41, height: 61 });
  assert.deepEqual(readImageInfo(makeWebp({ width: 42, height: 62, exif: true })), { mediaType: "image/webp", width: 42, height: 62 });
  assert.equal(readImageInfo(Buffer.from("GIF89a....................................")), null);
  assert.equal(readImageInfo(Buffer.from("not an image")), null);
});

test("metadata that could leak paths or device names is removed without touching pixels", () => {
  const png = makePng(4, 8, { text: ["Software\0swiftui-render /Users/dev/SecretApp/Login.swift", "Comment\0iPhone 15 Pro"] });
  assert.ok(png.includes("SecretApp"));
  const clean = stripImageMetadata(png);
  assert.equal(clean.includes("SecretApp"), false);
  assert.equal(clean.includes("iPhone 15"), false);
  assert.deepEqual(readImageInfo(clean), { mediaType: "image/png", width: 4, height: 8 });
  const webp = stripImageMetadata(makeWebp({ exif: true }));
  assert.equal(webp.includes("secret-device-name"), false);
  assert.deepEqual(readImageInfo(webp), { mediaType: "image/webp", width: 8, height: 16 });
  assert.throws(() => stripImageMetadata(Buffer.from("nope")), ContractError);
});

// ---- classification honesty
test("a method can only claim classifications it genuinely supports", () => {
  assert.doesNotThrow(() => assertClassification("swiftui-render", "apple-swiftui", "swiftui"));
  assert.throws(() => assertClassification("swiftopenui", "apple-swiftui", "swiftui"), /cannot support/);
  assert.throws(() => assertClassification("swiftui-render", "apple-uikit", "uikit"), /cannot support/);
  assert.throws(() => assertClassification("browser-viewport", "react-native-native", "react-native"), /cannot support/);
  assert.throws(() => assertClassification("mugshot", "apple-swiftui", "swiftui"), /cannot support/);
  assert.throws(() => assertClassification("xcode-simulator", "apple-uikit", "swiftui"), /does not describe framework/);
  assert.equal(classificationFor("xcode-simulator", "uikit"), "apple-uikit");
  assert.equal(classificationFor("swiftui-render", "uikit"), null);
  assert.equal(classificationFor("swiftopenui", "swiftui"), "cross-platform-swift-compatible");
});

test("a genuine SwiftUI capture is classified apple-swiftui with full provenance", async () => {
  const { runDir, file } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login"] });
  const entry = await addCapture(manifest, runDir, { ...base(), sourceFile: file("login.png"), rendererVersion: "0.2.0" });
  assert.equal(entry.status, "captured");
  assert.deepEqual(entry.renderer, { name: "swiftui-render", version: "0.2.0", method: "swiftui-render", classification: "apple-swiftui" });
  assert.deepEqual([entry.platform, entry.framework, entry.execution.location, entry.execution.os, entry.execution.toolchain], ["ios", "swiftui", "local", "macos", "Xcode 16.2"]);
  assert.deepEqual([entry.device.pixel_width, entry.device.pixel_height, entry.device.scale_factor, entry.device.orientation], [4, 8, 2, "portrait"]);
  assert.equal(entry.revision, SHA);
  assert.equal(entry.file.sha256, sha256Hex(await readFile(path.join(runDir, entry.file.path))));
  assert.ok(entry.limitations.some((l) => /macOS/.test(l)), "known renderer limitations travel with the evidence");
});

test("SwiftOpenUI output is always approximate and can never be labelled Apple SwiftUI", async () => {
  const { runDir, file } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login"] });
  const entry = await addCapture(manifest, runDir, { ...base({ method: "swiftopenui", execution: local("linux") }), sourceFile: file("login.png") });
  assert.deepEqual([entry.status, entry.renderer.classification], ["approximate", "cross-platform-swift-compatible"]);
  assert.ok(entry.limitations.some((l) => /Not Apple's SwiftUI/.test(l)));
  assert.ok(limitationsFor(finalizeManifest(manifest)).some((l) => /approximate render .* not genuine ios platform output/.test(l)));
  // A forged manifest that calls it captured, or claims Apple classification, fails validation.
  const forged = structuredClone(manifest);
  forged.renders[0].status = "captured";
  assert.ok((await validateRenderManifest(forged)).some((p) => /approximate classification must have status approximate/.test(p)));
  forged.renders[0].renderer.classification = "apple-swiftui";
  assert.ok((await validateRenderManifest(forged)).some((p) => /cannot support classification apple-swiftui/.test(p)));
});

test("captures that the method cannot honestly produce are refused", async () => {
  const { runDir, file } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login"] });
  const attempt = (over) => addCapture(manifest, runDir, { ...base(over), sourceFile: file("login.png") });
  await assert.rejects(() => attempt({ execution: local("linux") }), /cannot run on linux/, "Apple rendering needs macOS");
  await assert.rejects(() => attempt({ framework: "uikit" }), /cannot render framework uikit/);
  await assert.rejects(() => attempt({ platform: "android" }), /does not capture platform android/);
  await assert.rejects(() => attempt({ execution: { location: "local", os: "macos", toolchain: null, remote: {} } }), /Local captures must not carry remote provenance/);
  await assert.rejects(() => attempt({ execution: { location: "remote", os: "macos", toolchain: null } }), /must carry remote provenance/);
  await assert.rejects(() => attempt({ method: "xcode-simulator", framework: "swiftui", platform: "react-native" }), /native platform/);
  await assert.rejects(() => attempt({ method: "browser-viewport", platform: "react-native", framework: "react-native", nativePlatform: "ios", execution: local("macos") }), /does not capture platform react-native|cannot render framework react-native/);
  assert.equal(manifest.renders.length, 0, "a refused capture leaves no evidence behind");
});

test("React Native counts as native only when captured from a native runtime", async () => {
  const { runDir, file } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login"] });
  const native = await addCapture(manifest, runDir, { ...base({ platform: "react-native", framework: "react-native", method: "xcode-simulator", nativePlatform: "ios" }), sourceFile: file("login.png") });
  assert.deepEqual([native.renderer.classification, native.native_platform], ["react-native-native", "ios"]);
  const web = await addCapture(manifest, runDir, { ...base({ screenId: "web", platform: "mobile-web", framework: "web", method: "browser-viewport", execution: local("linux", "playwright") }), sourceFile: file("home.png") });
  assert.equal(web.renderer.classification, "mobile-web");
  assert.ok(limitationsFor(manifest).some((l) => /Web rendering: it shows the web build, not how a native app looks/.test(l)));
  await assert.rejects(() => addCapture(manifest, runDir, { ...base({ platform: "react-native", framework: "react-native", method: "browser-viewport", nativePlatform: "ios" }), sourceFile: file("login.png") }), ContractError);
});

test("Mugshot WebP output is accepted with its limitations, Paparazzi PNG too", async () => {
  const { runDir, file } = await setup({ "shot.webp": makeWebp({ width: 130, height: 280 }) });
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["a", "b"] });
  const a = await addCapture(manifest, runDir, { platform: "android", framework: "compose", method: "mugshot", execution: local("linux", "JDK 21"), device: { width: 360, height: 780, scale_factor: 3 }, theme: "dark", projectId: "demo-app", screenId: "a", sourceFile: file("shot.webp") });
  assert.deepEqual([a.status, a.renderer.classification, a.file.media_type], ["captured", "android-compose", "image/webp"]);
  assert.ok(a.limitations.some((l) => /layoutlib/.test(l)));
  assert.ok(a.limitations.some((l) => /does not match logical width/.test(l)), "a downscaled image is flagged rather than silently mislabelled");
  const b = await addCapture(manifest, runDir, { platform: "android", framework: "android-views", method: "paparazzi", execution: local("windows", "JDK 21"), device: { width: 2, height: 4, scale_factor: 2 }, projectId: "demo-app", screenId: "b", sourceFile: file("login.png") });
  assert.equal(b.renderer.classification, "android-views");
});

// ---- failures, gaps and completeness
test("failed, unsupported and missing screens are recorded, never dropped", async () => {
  const { runDir, file } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login", "settings", "profile", "checkout"] });
  await addCapture(manifest, runDir, { ...base(), sourceFile: file("login.png") });
  addFailure(manifest, { ...base({ screenId: "settings" }), status: "failed", code: "TOOL_FAILED", message: "swiftui-render exited with an error" });
  addFailure(manifest, { ...base({ screenId: "profile" }), status: "unsupported", code: "NEEDS_APP_STATE", message: "Depends on a signed-in session" });
  addFailure(manifest, { ...base({ screenId: "checkout" }), status: "missing", code: "NO_OUTPUT", message: "No image was produced" });
  finalizeManifest(manifest);
  assert.equal(manifest.session.status, "incomplete");
  assert.equal(manifest.session.reasons.length, 6, "each unusable screen is named as a no-usable-screenshot reason and as a status reason");
  assert.deepEqual(manifest.renders.map((r) => r.status), ["captured", "failed", "unsupported", "missing"]);
  assert.throws(() => addFailure(manifest, { ...base(), status: "captured", code: "x", message: "y" }), /failed, unsupported or missing/);
  assert.throws(() => addFailure(manifest, { ...base(), status: "failed" }), /code and a message/);
});

test("a requested screen with no attempt at all is reported as missing evidence", async () => {
  const { runDir, file } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login", "never-tried"] });
  await addCapture(manifest, runDir, { ...base(), sourceFile: file("login.png") });
  finalizeManifest(manifest);
  assert.equal(manifest.session.status, "incomplete");
  assert.match(manifest.session.reasons.join(" "), /never-tried: no render was attempted/);
});

test("a session is complete only when every requested screen has an image and nothing failed", async () => {
  const { runDir, file } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login", "home"] });
  await addCapture(manifest, runDir, { ...base(), sourceFile: file("login.png") });
  await addCapture(manifest, runDir, { ...base({ screenId: "home" }), sourceFile: file("home.png") });
  finalizeManifest(manifest);
  assert.equal(manifest.session.status, "complete");
  assert.deepEqual(await validateRenderManifest(manifest, { runDir }), []);
  const lying = structuredClone(manifest);
  lying.session.requested_screens.push("extra");
  assert.ok((await validateRenderManifest(lying)).some((p) => /complete but extra has no screenshot/.test(p)));
});

test("duplicate screens get distinct ids, and tampering with a stored image is detected", async () => {
  const { runDir, file } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login"] });
  const one = await addCapture(manifest, runDir, { ...base(), sourceFile: file("login.png") });
  const two = await addCapture(manifest, runDir, { ...base(), sourceFile: file("login.png") });
  assert.notEqual(one.screenshot_id, two.screenshot_id);
  await writeFile(path.join(runDir, one.file.path), makePng(4, 8, { seed: 99 }));
  assert.ok((await validateRenderManifest(manifest, { runDir })).some((p) => /file hash does not match/.test(p)));
  await writeFile(path.join(runDir, two.file.path), Buffer.from("not an image"));
  assert.ok((await validateRenderManifest(manifest, { runDir })).some((p) => /not a PNG or WebP/.test(p)));
});

test("a non-image file cannot be imported as a screenshot", async () => {
  const { runDir } = await setup({ "fake.png": "<html>not an image</html>" });
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login"] });
  await assert.rejects(() => addCapture(manifest, runDir, { ...base(), sourceFile: path.join(path.dirname(runDir), "fake.png") }), /not a PNG or WebP/);
  assert.equal(manifest.renders.length, 0, "no fake evidence is created to make the report look complete");
});

// ---- local vs remote provenance
test("local and remote evidence are distinguishable and remote carries its workflow provenance", async () => {
  const { runDir, file } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login", "home"] });
  const remote = { provider: "github-actions", repository: "acme/ios-app", revision: SHA, workflow: "dumbass-render.yml", run_id: "9001", authorization_id: "auth-1" };
  const r = await addCapture(manifest, runDir, { ...base(), execution: { location: "remote", os: "macos", toolchain: "Xcode 16.2", remote }, sourceFile: file("login.png") });
  const l = await addCapture(manifest, runDir, { ...base({ screenId: "home" }), sourceFile: file("home.png") });
  assert.deepEqual([r.execution.location, l.execution.location], ["remote", "local"]);
  assert.deepEqual(r.execution.remote, remote);
  assert.equal(l.execution.remote, undefined);
  const notes = limitationsFor(manifest).filter((n) => /Rendered remotely/.test(n));
  assert.equal(notes.length, 1);
  assert.match(notes[0], /run 9001/);
});

// ---- schema conformance with the protocol
test("manifests, frames and capabilities produced here validate against the protocol schemas", async () => {
  const { runDir, file } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login", "home", "bad", "approx"] });
  const remote = { provider: "github-actions", repository: "acme/ios-app", revision: SHA, workflow: "dumbass-render.yml", run_id: null, authorization_id: "auth-1" };
  await addCapture(manifest, runDir, { ...base({ execution: { location: "remote", os: "macos", toolchain: null, remote } }), sourceFile: file("login.png") });
  await addCapture(manifest, runDir, { ...base({ screenId: "home" }), sourceFile: file("home.png") });
  await addCapture(manifest, runDir, { ...base({ screenId: "approx", method: "swiftopenui", execution: local("linux") }), sourceFile: file("home.png") });
  addFailure(manifest, { ...base({ screenId: "bad" }), status: "failed", code: "TOOL_FAILED", message: "boom" });
  finalizeManifest(manifest);
  const valid = validator("render-manifest");
  assert.equal(valid(manifest), true, JSON.stringify(valid.errors));
  const broken = structuredClone(manifest);
  delete broken.renders[0].file;
  assert.equal(valid(broken), false, "a captured entry must carry its file");
  const noProvenance = structuredClone(manifest);
  delete noProvenance.renders[0].execution.remote;
  assert.equal(valid(noProvenance), false, "a remote entry must carry its provenance");
  const caps = validator("capabilities");
  const record = capabilityRecord(manifest);
  assert.equal(caps(record), true, JSON.stringify(caps.errors));
  assert.equal(record.mode, "static");
  assert.equal(record.capabilities.isolated_sessions, false, "isolation is not claimed unless a host enforces it");
});

// ---- screenshot-only evaluator boundary
test("evaluators receive neutral-named images and nothing else, with no metadata inside the images", async () => {
  const secret = "SECRET_APP_PATH=/Users/dev/Acme/LoginViewModel.swift";
  const { runDir, file } = await setup({ "Login.png": makePng(4, 8, { text: [`Comment\0${secret}`] }), "Home.png": makePng(4, 8, { seed: 3 }) });
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["LoginScreen", "HomeScreen", "gone"] });
  await addCapture(manifest, runDir, { ...base({ screenId: "LoginScreen" }), sourceFile: file("Login.png") });
  await addCapture(manifest, runDir, { ...base({ screenId: "HomeScreen" }), sourceFile: file("Home.png") });
  addFailure(manifest, { ...base({ screenId: "gone" }), status: "failed", code: "TOOL_FAILED", message: "boom" });
  finalizeManifest(manifest);
  const prepared = await prepareEvaluatorInput(manifest, runDir);
  const evaluatorDir = path.join(runDir, "renders", "evaluator-input");
  assert.deepEqual((await readdir(evaluatorDir)).sort(), ["screen-001.png", "screen-002.png"]);
  assert.equal(await isScreenshotOnly(evaluatorDir), true);
  for (const name of await readdir(evaluatorDir)) {
    const bytes = await readFile(path.join(evaluatorDir, name));
    assert.ok(readImageInfo(bytes), "only real images are present");
    assert.equal(bytes.includes("SECRET_APP_PATH"), false, "embedded metadata must not reach the evaluator");
  }
  const everythingTheEvaluatorGets = JSON.stringify(prepared.images) + (await readdir(evaluatorDir)).join(" ");
  for (const leak of ["LoginScreen", "HomeScreen", "swiftui-render", "apple-swiftui", "Xcode", "demo-app", "ios", "swiftui", "classification", "sha256"]) {
    assert.equal(everythingTheEvaluatorGets.includes(leak), false, `evaluator input must not mention ${leak}`);
  }
  assert.deepEqual(Object.keys(prepared.images[0]).sort(), ["label", "path"]);
  assert.equal(prepared.excluded.length, 1, "the failed capture is not handed over");
  // The controller-side mapping exists but lives outside the evaluator folder.
  const mapping = JSON.parse(await readFile(path.join(runDir, "renders", "evaluator-mapping.json"), "utf8"));
  assert.equal(mapping.mapping.length, 2);
  assert.equal(await isScreenshotOnly(path.join(runDir, "renders")).catch(() => false), false);
});

test("approximate renders are withheld from evaluators unless explicitly approved", async () => {
  const { runDir, file } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login", "approx"] });
  await addCapture(manifest, runDir, { ...base(), sourceFile: file("login.png") });
  await addCapture(manifest, runDir, { ...base({ screenId: "approx", method: "swiftopenui", execution: local("linux") }), sourceFile: file("home.png") });
  const strict = await prepareEvaluatorInput(manifest, runDir);
  assert.equal(strict.images.length, 1);
  assert.match(strict.excluded[0].reason, /approximate render not approved/);
  const allowed = await prepareEvaluatorInput(manifest, runDir, { includeApproximate: true });
  assert.equal(allowed.images.length, 2);
  assert.equal(allowed.mapping.find((m) => m.status === "approximate").classification, "cross-platform-swift-compatible");
});

test("evaluator input is refused when the render manifest fails its integrity checks", async () => {
  const { runDir, file } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login"] });
  const entry = await addCapture(manifest, runDir, { ...base(), sourceFile: file("login.png") });
  await writeFile(path.join(runDir, entry.file.path), makePng(4, 8, { seed: 77 }));
  await assert.rejects(() => prepareEvaluatorInput(manifest, runDir), /failed validation.*hash/);
});

test("frame records for evaluation sessions validate against the existing frame schema and match the evaluator images", async () => {
  const { runDir, file } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login"] });
  await addCapture(manifest, runDir, { ...base(), sourceFile: file("login.png") });
  await prepareEvaluatorInput(manifest, runDir);
  const frames = await materializeFrames(manifest, runDir, ["novice", "expert"]);
  assert.equal(frames.length, 2);
  const frameSchema = validator("frame");
  for (const f of frames) {
    const record = JSON.parse(await readFile(path.join(runDir, f.path.replace(/\.png$/, ".json")), "utf8"));
    assert.equal(frameSchema(record), true, JSON.stringify(frameSchema.errors));
    assert.equal(record.sha256, sha256Hex(await readFile(path.join(runDir, f.path))), "the observer's hash check passes on rendered frames");
    assert.equal(record.session_id, f.session);
  }
  await assert.rejects(() => materializeFrames(manifest, runDir, ["bad id"]), /Invalid session id/);
});

test("the report limitations always include what static screenshots cannot establish", async () => {
  const { runDir, file } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: ["login"] });
  await addCapture(manifest, runDir, { ...base(), sourceFile: file("login.png") });
  const text = limitationsFor(finalizeManifest(manifest)).join("\n");
  for (const must of [/Gesture behavior.*not established/, /screen reader behavior.*not established/, /Permission flows.*performance.*crashes/, /touch target behavior/]) assert.match(text, must);
});

test("collectImages returns only fresh images, so committed goldens are not mistaken for new output", async () => {
  const dir = await makeTree({ "old/a.png": makePng(2, 2), "new/b.webp": makeWebp(), "readme.txt": "x" });
  const future = Date.now() + 60_000;
  const { utimes } = await import("node:fs/promises");
  await utimes(path.join(dir, "old/a.png"), new Date(future - 3_600_000), new Date(future - 3_600_000));
  const fresh = await collectImages(dir, { since: future - 1000 });
  assert.deepEqual(fresh.map((f) => path.basename(f)), []);
  await utimes(path.join(dir, "new/b.webp"), new Date(future), new Date(future));
  assert.deepEqual((await collectImages(dir, { since: future - 1000 })).map((f) => path.basename(f)), ["b.webp"]);
  assert.equal((await collectImages(dir)).length, 2);
});

test("the written manifest round-trips", async () => {
  const { runDir } = await setup();
  const manifest = createManifest({ runId: "run-1", requestedScreens: [] });
  await writeManifest(runDir, manifest);
  assert.deepEqual(JSON.parse(await readFile(path.join(runDir, "renders/render-manifest.json"), "utf8")), manifest);
});

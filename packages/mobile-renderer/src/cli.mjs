#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { defaultRunner, planRender, runPlan, collectPlanOutputs, SWIFTUI_RENDER_PRESETS } from "./adapters.mjs";
import { AuthorizationError, createAuthorization, describeRemoteExecution } from "./consent.mjs";
import { ContractError, METHODS } from "./contracts.mjs";
import { detectEnvironment, javaMajor } from "./environment.mjs";
import {
  MANIFEST_FILE, addCapture, addFailure, capabilityRecord, collectImages, createManifest, finalizeManifest, limitationsFor,
  materializeFrames, prepareEvaluatorInput, readImageInfo, readManifest, validateRenderManifest, writeManifest,
} from "./evidence.mjs";
import { buildWorkflow, executeHosted, ghCliTransport, HostedRunError } from "./hosted.mjs";
import { DEVICE_PROFILES, captureMobileWeb, detectPlaywright } from "./mobile-web.mjs";
import { detectProject } from "./project.mjs";
import { selectRenderer } from "./selection.mjs";

const OPTIONS = {
  project: { type: "string" }, platform: { type: "string" }, framework: { type: "string" }, target: { type: "string" },
  url: { type: "string" }, remote: { type: "string" }, method: { type: "string" }, "run-dir": { type: "string" }, "run-id": { type: "string" },
  screen: { type: "string", multiple: true }, theme: { type: "string" }, "ui-state": { type: "string" }, profile: { type: "string" },
  module: { type: "string" }, "module-dir": { type: "string" }, variant: { type: "string" }, device: { type: "string" },
  udid: { type: "string" }, serial: { type: "string" }, approve: { type: "boolean" }, from: { type: "string" },
  "native-platform": { type: "string" }, "device-name": { type: "string" }, "device-width": { type: "string" }, "device-height": { type: "string" },
  scale: { type: "string" }, revision: { type: "string" }, "project-id": { type: "string" }, "tool-version": { type: "string" },
  "include-approximate": { type: "boolean" }, sessions: { type: "string" }, kind: { type: "string" }, spec: { type: "string" },
  write: { type: "string" }, "write-capabilities": { type: "boolean" }, plan: { type: "string" }, authorization: { type: "string" }, id: { type: "string" }, out: { type: "string" },
  "user-confirmed": { type: "boolean" }, status: { type: "string" }, code: { type: "string" }, message: { type: "string" },
};

const USAGE = `dumbass-render <command> [options]
  detect | select | plan | render | capture | ingest | fail | finalize | validate
  evaluator-input | capabilities | workflow | describe-remote | authorize | hosted-run
Every command prints JSON. plan and select never execute anything; render needs --approve.`;

class UsageError extends Error {}

function need(values, key) {
  if (!values[key]) throw new UsageError(`--${key} is required`);
  return values[key];
}

function parseScreens(list = []) {
  return list.map((entry) => {
    const [id, file] = entry.split("=");
    return { id, ...(file ? { file } : {}) };
  });
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function environment(ctx, withPlaywright = true) {
  const env = await detectEnvironment({ probe: ctx.probe, ...(ctx.rawPlatform ? { rawPlatform: ctx.rawPlatform } : {}) });
  if (withPlaywright) env.tools.playwright = await (ctx.detectPlaywright ?? detectPlaywright)();
  return env;
}

async function openManifest(values, screens) {
  const runDir = path.resolve(need(values, "run-dir"));
  await mkdir(runDir, { recursive: true });
  let manifest;
  if (await exists(path.join(runDir, MANIFEST_FILE))) {
    manifest = await readManifest(runDir);
    manifest.session.requested_screens = [...new Set([...manifest.session.requested_screens, ...screens.map((s) => s.id)])];
  } else {
    manifest = createManifest({ runId: need(values, "run-id"), requestedScreens: screens.map((s) => s.id) });
  }
  return { runDir, manifest };
}

function toolchainFor(method, env) {
  const t = env.tools;
  if (method === "swiftui-render" || method === "xcode-simulator") return t.xcodebuild?.version ? `Xcode ${t.xcodebuild.version}` : t.swift?.version ? `Swift ${t.swift.version}` : null;
  if (method === "mugshot" || method === "paparazzi") return t.java?.version ? `JDK ${javaMajor(t.java.version)}` : null;
  if (method === "android-device") return t.adb?.version ? `adb ${t.adb.version}` : null;
  return null;
}

function deviceFor(values, method, info) {
  const width = values["device-width"] ? Number(values["device-width"]) : undefined;
  const height = values["device-height"] ? Number(values["device-height"]) : undefined;
  const scale = values.scale ? Number(values.scale) : undefined;
  if (width && height) return { name: values["device-name"], width, height, ...(scale ? { scale_factor: scale } : {}) };
  if (method === "swiftui-render" && SWIFTUI_RENDER_PRESETS[values.device ?? "iphone"]) return SWIFTUI_RENDER_PRESETS[values.device ?? "iphone"];
  if (scale && info) return { name: values["device-name"], width: info.width / scale, height: info.height / scale, scale_factor: scale };
  throw new UsageError("Give --device-width and --device-height, or --scale, so the logical device size is recorded rather than guessed");
}

async function ingestFiles({ files, manifest, runDir, values, env, method, location = "local", remote = null, screens = [] }) {
  const added = [];
  const requestedIds = new Set(screens.map((s) => s.id));
  for (const file of files) {
    const stem = path.basename(file).replace(/\.[^.]+$/, "");
    const info = readImageInfo(await readFile(file));
    try {
      const entry = await addCapture(manifest, runDir, {
        sourceFile: file, screenId: stem, uiState: values["ui-state"], theme: values.theme ?? "unspecified",
        platform: need(values, "platform"), nativePlatform: values["native-platform"], framework: need(values, "framework"),
        method, rendererVersion: values["tool-version"] ?? null,
        execution: { location, os: location === "remote" ? remote.os : env.os, toolchain: toolchainFor(method, env), ...(remote ? { remote: remote.provenance } : {}) },
        device: deviceFor(values, method, info), revision: values.revision ?? null,
        projectId: values["project-id"] ?? "project",
      });
      added.push(entry.screenshot_id);
    } catch (error) {
      if (!(error instanceof ContractError)) throw error;
      addFailure(manifest, {
        status: "failed", code: "INVALID_CAPTURE", message: error.message, screenId: stem, uiState: values["ui-state"], theme: values.theme ?? "unspecified",
        platform: values.platform, nativePlatform: values["native-platform"], framework: values.framework, method,
        execution: { location, os: env.os, toolchain: toolchainFor(method, env), ...(remote ? { remote: remote.provenance } : {}) },
        revision: values.revision ?? null, projectId: values["project-id"] ?? "project",
      });
    }
  }
  for (const id of requestedIds) {
    if (!manifest.renders.some((r) => r.screen_id === id)) {
      addFailure(manifest, {
        status: "missing", code: "NO_OUTPUT", message: `The renderer produced no image for ${id}`, screenId: id, uiState: values["ui-state"], theme: values.theme ?? "unspecified",
        platform: values.platform, nativePlatform: values["native-platform"], framework: values.framework, method,
        execution: { location, os: env.os, toolchain: toolchainFor(method, env), ...(remote ? { remote: remote.provenance } : {}) },
        revision: values.revision ?? null, projectId: values["project-id"] ?? "project",
      });
    }
  }
  return added;
}

/**
 * Runs one command. Everything external (probing, running tools, the browser, the hosted transport)
 * can be replaced through ctx, which is how the tests avoid touching real tools or GitHub.
 */
export async function run(argv, ctx = {}) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "help") return { usage: USAGE };
  const { values } = parseArgs({ args: rest, options: OPTIONS, allowPositionals: false, strict: true });
  const screens = parseScreens(values.screen);

  if (command === "detect" || command === "select" || command === "plan") {
    const env = await environment(ctx);
    const project = values.project ? await detectProject(values.project) : null;
    if (command === "detect") return { environment: env, project };
    if (command === "select") {
      return selectRenderer({ env, project, request: { platform: values.platform, framework: values.framework, target: values.target, url: values.url }, consent: { remote: values.remote ?? "unasked" } });
    }
    const outDir = values.out ?? path.join(tmpdir(), "dumbass-render-out");
    return planRender({ method: need(values, "method"), env, project, request: { outDir, screens, module: values.module, moduleDir: values["module-dir"], variant: values.variant, udid: values.udid, serial: values.serial } });
  }

  if (command === "render") {
    const method = need(values, "method");
    const env = await environment(ctx, false);
    const project = values.project ? await detectProject(values.project) : null;
    const outDir = await mkdtemp(path.join(tmpdir(), "dumbass-render-"));
    try {
      const plan = planRender({ method, env, project, request: { outDir, screens, module: values.module, moduleDir: values["module-dir"], variant: values.variant, udid: values.udid, serial: values.serial } });
      if (plan.ingestOnly) throw new UsageError(`${method} has no automated capture; use ingest on output you produced`);
      if (!values.approve) return { executed: false, reason: "Nothing was run. Show the plan to the user and pass --approve once they agree.", plan };
      const { startedAt, results } = await runPlan(plan, { runner: ctx.runner ?? defaultRunner, approve: "all" });
      const { runDir, manifest } = await openManifest(values, screens);
      const files = await collectPlanOutputs(plan, startedAt);
      const added = await ingestFiles({ files, manifest, runDir, values, env, method, screens });
      for (const r of results) if (r.status === "failed") addFailure(manifest, { status: "failed", code: "TOOL_FAILED", message: `Step ${r.id} failed${r.stderr ? `: ${String(r.stderr).split("\n")[0]}` : ""}`, screenId: r.id, uiState: values["ui-state"], theme: values.theme ?? "unspecified", platform: need(values, "platform"), nativePlatform: values["native-platform"], framework: need(values, "framework"), method, execution: { location: "local", os: env.os, toolchain: toolchainFor(method, env) }, revision: values.revision ?? null, projectId: values["project-id"] ?? "project" });
      await writeManifest(runDir, manifest);
      return { executed: true, steps: results.map(({ id, status, code }) => ({ id, status, code })), added };
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }

  if (command === "capture") {
    const env = await environment(ctx, false);
    const id = screens[0]?.id ?? need(values, "screen");
    const { runDir, manifest } = await openManifest(values, [{ id }]);
    const tmp = await mkdtemp(path.join(tmpdir(), "dumbass-web-"));
    try {
      const shot = await captureMobileWeb({ url: need(values, "url"), profile: values.profile, theme: values.theme === "dark" ? "dark" : "light", outFile: path.join(tmp, `${id}.png`), launcher: ctx.launcher, waitMs: 400 });
      const entry = await addCapture(manifest, runDir, {
        sourceFile: shot.file, screenId: id, uiState: values["ui-state"], theme: shot.theme, platform: "mobile-web", framework: "web", method: "browser-viewport",
        rendererVersion: `${shot.browser.name} ${shot.browser.version}`, capturedAt: shot.capturedAt,
        execution: { location: "local", os: env.os, toolchain: "playwright" }, device: shot.device,
        revision: values.revision ?? null, projectId: values["project-id"] ?? "web", limitations: shot.blockedRequests ? [`${shot.blockedRequests} request(s) outside the allowed origin were blocked, so the page may be missing third-party content`] : [],
      });
      await writeManifest(runDir, manifest);
      return { added: entry.screenshot_id, profile: values.profile ?? "iphone-14", profiles: Object.keys(DEVICE_PROFILES) };
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  if (command === "ingest") {
    const method = need(values, "method");
    const env = await environment(ctx, false);
    const { runDir, manifest } = await openManifest(values, screens);
    const from = path.resolve(need(values, "from"));
    const files = (await stat(from)).isDirectory() ? await collectImages(from) : [from];
    const added = await ingestFiles({ files, manifest, runDir, values, env, method, screens });
    await writeManifest(runDir, manifest);
    return { added };
  }

  if (command === "fail") {
    const method = need(values, "method");
    const env = await environment(ctx, false);
    const id = screens[0]?.id ?? need(values, "screen");
    const { runDir, manifest } = await openManifest(values, [{ id }]);
    addFailure(manifest, {
      status: need(values, "status"), code: need(values, "code"), message: need(values, "message"), screenId: id, uiState: values["ui-state"], theme: values.theme ?? "unspecified",
      platform: need(values, "platform"), nativePlatform: values["native-platform"], framework: need(values, "framework"), method,
      execution: { location: "local", os: env.os, toolchain: toolchainFor(method, env) }, revision: values.revision ?? null, projectId: values["project-id"] ?? "project",
    });
    await writeManifest(runDir, manifest);
    return { recorded: values.status };
  }

  if (command === "finalize" || command === "validate" || command === "evaluator-input" || command === "capabilities") {
    const runDir = path.resolve(need(values, "run-dir"));
    const manifest = await readManifest(runDir);
    if (command === "finalize") {
      finalizeManifest(manifest);
      await writeManifest(runDir, manifest);
      const counts = {};
      for (const r of manifest.renders) counts[r.status] = (counts[r.status] ?? 0) + 1;
      return { session: manifest.session, counts };
    }
    if (command === "validate") {
      const problems = await validateRenderManifest(manifest, { runDir });
      return { ok: problems.length === 0, problems };
    }
    if (command === "capabilities") {
      const record = capabilityRecord(manifest);
      if (values["write-capabilities"]) await writeFile(path.join(runDir, "capabilities.json"), `${JSON.stringify(record, null, 2)}\n`);
      return record;
    }
    const prepared = await prepareEvaluatorInput(manifest, runDir, { includeApproximate: values["include-approximate"] });
    const frames = values.sessions ? await materializeFrames(manifest, runDir, values.sessions.split(",")) : [];
    // Only labels and paths are returned: renderer names, screen identifiers and tool output stay in the controller-side mapping.
    return { images: prepared.images, excluded: prepared.excluded.length, frames };
  }

  if (command === "workflow") {
    const spec = JSON.parse(await readFile(need(values, "spec"), "utf8"));
    const built = buildWorkflow(spec);
    if (values.write) {
      const target = path.resolve(values.write);
      if (await exists(target)) throw new UsageError(`${target} already exists; Dumbass will not overwrite a workflow`);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, built.yaml, { flag: "wx" });
      return { written: target, committed: false, note: "Review the file and commit it yourself. Dumbass does not commit, push or change repository settings.", commands: built.commands };
    }
    return built;
  }

  if (command === "describe-remote") {
    const plan = JSON.parse(await readFile(need(values, "plan"), "utf8"));
    return { disclosure: describeRemoteExecution(plan) };
  }

  if (command === "authorize") {
    if (!values["user-confirmed"]) throw new UsageError("Run describe-remote, show it to the user, and pass --user-confirmed only after they explicitly agree to every line");
    const plan = JSON.parse(await readFile(need(values, "plan"), "utf8"));
    const record = createAuthorization({ id: need(values, "id"), repository: plan.repository, revision: plan.revision, workflow: plan.workflow, platform: plan.platform, method: plan.method, retentionDays: plan.retentionDays });
    if (values.out) await writeFile(path.resolve(values.out), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  }

  if (command === "hosted-run") {
    const plan = JSON.parse(await readFile(need(values, "plan"), "utf8"));
    const authorization = JSON.parse(await readFile(need(values, "authorization"), "utf8"));
    const env = await environment(ctx, false);
    const tmp = await mkdtemp(path.join(tmpdir(), "dumbass-hosted-"));
    try {
      const outcome = await executeHosted({ authorization, plan, transport: ctx.transport ?? ghCliTransport(), directory: tmp, now: ctx.now });
      const { runDir, manifest } = await openManifest(values, parseScreens(plan.screens ?? []));
      const files = await collectImages(tmp);
      const meta = { ...values, platform: plan.metadata.platform, framework: plan.metadata.framework, theme: plan.metadata.theme, "project-id": plan.metadata.projectId, "tool-version": plan.metadata.rendererVersion, revision: plan.revision, "device-width": String(plan.metadata.device.width), "device-height": String(plan.metadata.device.height), scale: String(plan.metadata.device.scale_factor), "device-name": plan.metadata.device.name };
      const added = await ingestFiles({ files, manifest, runDir, values: meta, env: { ...env, os: plan.platform }, method: plan.method, location: "remote", remote: { os: plan.platform, provenance: outcome.provenance }, screens: parseScreens(plan.screens ?? []) });
      await writeManifest(runDir, manifest);
      return { added, provenance: outcome.provenance, cleanup: outcome.cleanup };
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  throw new UsageError(`Unknown command ${command}`);
}

export async function main(argv) {
  try {
    const result = await run(argv);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const kind = error instanceof AuthorizationError ? "authorization" : error instanceof ContractError ? "contract" : error instanceof HostedRunError ? "hosted-run" : error instanceof UsageError ? "usage" : "error";
    process.stderr.write(`${JSON.stringify({ error: kind, message: error instanceof Error ? error.message : String(error), ...(error instanceof AuthorizationError ? { problems: error.problems } : {}) }, null, 2)}\n`);
    return kind === "authorization" ? 3 : 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await main(process.argv.slice(2));
}

export { METHODS, limitationsFor };

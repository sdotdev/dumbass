import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { METHODS } from "./contracts.mjs";
import { collectImages } from "./evidence.mjs";

// Capture-method adapters. Each one turns a request into an explicit, inspectable command plan and
// can run that plan through an injected runner. Planning never executes anything, running executes
// only steps the caller approved, and no adapter edits the user's project: changes a tool needs are
// returned as text so the user can approve them first.

const SAFE = {
  id: /^[A-Za-z0-9._-]{1,64}$/,
  swiftFile: /^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]{1,200}\.swift$/,
  module: /^[A-Za-z0-9_-]{1,64}$/,
  moduleDir: /^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]{1,200}$/,
  variant: /^[A-Z][A-Za-z0-9]{0,30}$/,
  udid: /^(booted|[A-Fa-f0-9-]{36})$/,
  serial: /^[A-Za-z0-9._:-]{1,64}$/,
  device: /^(iphone|iphone-se|iphone-pro-max|ipad)$/,
};
function safe(kind, value, label) {
  if (typeof value !== "string" || !SAFE[kind].test(value)) throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  return value;
}

/** Logical size and scale that swiftui-render documents for its preset; other presets must be given explicitly. */
export const SWIFTUI_RENDER_PRESETS = { iphone: { width: 390, height: 844, scale_factor: 2, name: "iPhone preset (390x844 pt)" } };

/**
 * @typedef {{ id: string, argv: string[], cwd: string, purpose: string, stdoutFile?: string }} Step
 * @typedef {{ method: string, location: "local", steps: Step[], outputDir: string, requiredProjectChanges: string[], notes: string[], capturesCurrentState: boolean, ingestOnly: boolean }} Plan
 */

/**
 * @param {{ method: string, env: { os: string }, project?: { root: string } | null, request: { outDir: string, screens?: { id: string, file?: string, device?: string, theme?: string }[], module?: string, moduleDir?: string, variant?: string, udid?: string, serial?: string } }} input
 * @returns {Plan}
 */
export function planRender({ method, env, project, request }) {
  if (!METHODS[method]) throw new Error(`Unknown capture method ${method}`);
  const cwd = project?.root ?? process.cwd();
  const outDir = path.resolve(request.outDir);
  const plan = { method, location: /** @type {const} */ ("local"), steps: [], outputDir: outDir, requiredProjectChanges: [], notes: [], capturesCurrentState: false, ingestOnly: false };
  const screens = request.screens ?? [];

  if (method === "swiftui-render") {
    plan.notes.push("swiftui-render compiles one standalone Swift file per screen that defines a Preview view. It does not render an app project directly.");
    plan.requiredProjectChanges.push("Each screen needs a self-contained Swift file defining a Preview view (helper types in the same file). Dumbass does not create or edit these files without your approval; a screen that depends on other modules may not render.");
    for (const s of screens) {
      const id = safe("id", s.id, "screen id");
      const file = safe("swiftFile", s.file, "screen file");
      const device = safe("device", s.device ?? "iphone", "device");
      plan.steps.push({ id, cwd, purpose: `Render ${id} as genuine SwiftUI`, argv: ["swiftui-render", "render", file, `--${device}`, ...(s.theme === "dark" ? ["--dark"] : []), "-o", path.join(outDir, `${id}.png`), "--json"] });
    }
  } else if (method === "xcode-simulator") {
    plan.capturesCurrentState = true;
    plan.notes.push("Captures the screen the simulator is showing right now. Show each screen first, then capture it.");
    for (const s of screens) {
      const id = safe("id", s.id, "screen id");
      plan.steps.push({ id, cwd, purpose: `Capture the simulator screen as ${id}`, argv: ["xcrun", "simctl", "io", safe("udid", request.udid ?? "booted", "simulator id"), "screenshot", "--type=png", path.join(outDir, `${id}.png`)] });
    }
  } else if (method === "android-device") {
    plan.capturesCurrentState = true;
    plan.notes.push("Captures the screen the connected device or emulator is showing right now. Show each screen first, then capture it.");
    for (const s of screens) {
      const id = safe("id", s.id, "screen id");
      const serial = request.serial ? ["-s", safe("serial", request.serial, "device serial")] : [];
      plan.steps.push({ id, cwd, purpose: `Capture the Android screen as ${id}`, argv: ["adb", ...serial, "exec-out", "screencap", "-p"], stdoutFile: path.join(outDir, `${id}.png`) });
    }
  } else if (method === "paparazzi" || method === "mugshot") {
    const module = safe("module", request.module ?? "app", "gradle module");
    const moduleDir = safe("moduleDir", request.moduleDir ?? module, "module directory");
    const variant = safe("variant", request.variant ?? "Debug", "variant");
    const tool = method === "paparazzi" ? "Paparazzi" : "Mugshot";
    const wrapper = env.os === "windows" ? "gradlew.bat" : "./gradlew";
    plan.outputDir = path.join(cwd, moduleDir, "src", "test", "snapshots");
    plan.notes.push(`${tool} writes recorded images into the project's snapshot directory. Committed images from earlier runs live there too, so only files written during this run are collected.`);
    plan.notes.push("Check the tool's current documentation for the plugin version that matches this project's Gradle, Kotlin and Android Gradle Plugin versions; compatibility is not assumed.");
    plan.requiredProjectChanges.push(method === "paparazzi"
      ? "Apply the Paparazzi Gradle plugin to the module and add snapshot tests that render each screen. This edits build files and adds test code, so it needs your approval."
      : "Apply the Mugshot Gradle plugin and KSP to the module and annotate each preview composable with @Mugshot. This edits build files and source, so it needs your approval.");
    plan.steps.push({ id: `${method}-record`, cwd, purpose: `Record ${tool} snapshots for the ${module} module`, argv: [wrapper, "--console=plain", `:${module}:record${tool}${variant}`] });
  } else if (method === "swiftopenui") {
    plan.ingestOnly = true;
    plan.notes.push("SwiftOpenUI is not Apple's SwiftUI and has no iOS backend. Dumbass does not run it; screenshots you produced with it can be imported and are always labelled approximate.");
  } else if (method === "browser-viewport") {
    plan.notes.push("Mobile web is captured by the browser renderer; use the capture command with a URL.");
  }
  return plan;
}

/**
 * @typedef {(argv: string[], options: { cwd: string, stdoutFile?: string }) => Promise<{ ok: boolean, code: number | null, stdout: string, stderr: string }>} Runner
 */

/** @type {Runner} */
export function defaultRunner(argv, { cwd, stdoutFile }) {
  return new Promise((resolve) => {
    const [command, ...args] = argv;
    execFile(command, args, { cwd, encoding: "buffer", maxBuffer: 256 * 1024 * 1024, timeout: 30 * 60_000, windowsHide: true, shell: process.platform === "win32" }, async (error, stdout, stderr) => {
      let ok = !error;
      if (ok && stdoutFile) {
        try { await writeFile(stdoutFile, stdout); } catch { ok = false; }
      }
      resolve({ ok, code: error ? /** @type {any} */ (error).code ?? null : 0, stdout: stdoutFile ? "" : stdout.toString("utf8"), stderr: stderr.toString("utf8").slice(0, 4000) });
    });
  });
}

/**
 * Runs approved steps only. A step that was not approved is reported as skipped and is never run.
 * @param {Plan} plan
 * @param {{ runner?: Runner, approve: "all" | string[], now?: () => number }} options
 */
export async function runPlan(plan, { runner = defaultRunner, approve, now = Date.now }) {
  const startedAt = now();
  const approved = approve === "all" ? new Set(plan.steps.map((s) => s.id)) : new Set(approve);
  const results = [];
  for (const step of plan.steps) {
    if (!approved.has(step.id)) { results.push({ id: step.id, status: "skipped", reason: "not approved" }); continue; }
    const result = await runner(step.argv, { cwd: step.cwd, ...(step.stdoutFile ? { stdoutFile: step.stdoutFile } : {}) });
    results.push({ id: step.id, status: result.ok ? "ok" : "failed", code: result.code, stdout: result.stdout, stderr: result.stderr });
  }
  return { startedAt, results };
}

/** Collects images this run produced (newer than its start), not images already in the folder. */
export async function collectPlanOutputs(plan, startedAt) {
  return collectImages(plan.outputDir, { since: startedAt - 1000 });
}

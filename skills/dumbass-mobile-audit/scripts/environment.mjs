import { execFile } from "node:child_process";
import process from "node:process";

/**
 * @typedef {{ ok: boolean, stdout: string, stderr: string }} ProbeResult
 * @typedef {(command: string, args: string[]) => Promise<ProbeResult>} Probe
 * @typedef {{ found: boolean, version: string | null }} ToolInfo
 * @typedef {{ os: "macos" | "windows" | "linux" | "unknown", rawPlatform: string, arch: string, macosVersion: string | null, tools: Record<string, ToolInfo> }} Environment
 */

// Fixed command list. Nothing here is built from user input, so running through a shell on Windows
// (needed to resolve .cmd and .bat launchers such as gradle) cannot be used for injection.
const TOOLS = {
  xcodebuild: { args: ["-version"], pattern: /Xcode\s+([\d.]+)/ },
  xcrun: { args: ["--version"], pattern: /version\s+([\d.]+)/ },
  swift: { args: ["--version"], pattern: /Swift version\s+([\d.]+)/ },
  "swiftui-render": { args: ["--help"], pattern: null },
  java: { args: ["-version"], pattern: /version\s+"?([\d._]+)/ },
  gradle: { args: ["--version"], pattern: /Gradle\s+([\d.]+)/ },
  adb: { args: ["version"], pattern: /Version\s+([\d.]+)/ },
  node: { args: ["--version"], pattern: /v?([\d.]+)/ },
  git: { args: ["--version"], pattern: /version\s+([\d.]+)/ },
  gh: { args: ["--version"], pattern: /version\s+([\d.]+)/ },
};

/** @type {Probe} */
export function defaultProbe(command, args) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: 8000, windowsHide: true, shell: process.platform === "win32", maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => resolve({ ok: !error, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") }),
    );
  });
}

export function normalizeOs(rawPlatform) {
  if (rawPlatform === "darwin") return "macos";
  if (rawPlatform === "win32") return "windows";
  if (rawPlatform === "linux") return "linux";
  return "unknown";
}

/** Java prints its version to stderr and uses 1.8 style numbering for old releases. */
export function javaMajor(version) {
  if (!version) return null;
  const parts = version.split(/[._]/);
  const first = Number(parts[0]);
  if (first === 1) return Number(parts[1]) || null;
  return Number.isFinite(first) ? first : null;
}

/**
 * Detects the operating system and which rendering tools already exist. It only reads versions; it
 * never installs, modifies or starts anything, and it does not read environment variables.
 * @param {{ rawPlatform?: string, arch?: string, probe?: Probe, only?: string[] }} [options]
 * @returns {Promise<Environment>}
 */
export async function detectEnvironment(options = {}) {
  const rawPlatform = options.rawPlatform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const probe = options.probe ?? defaultProbe;
  const os = normalizeOs(rawPlatform);
  /** @type {Record<string, ToolInfo>} */
  const tools = {};
  const names = options.only ?? Object.keys(TOOLS);
  for (const name of names) {
    const spec = TOOLS[name];
    if (!spec) continue;
    // Apple tools cannot exist elsewhere; skipping them avoids a pointless failing spawn.
    if (["xcodebuild", "xcrun", "swiftui-render"].includes(name) && os !== "macos") {
      tools[name] = { found: false, version: null };
      continue;
    }
    const result = await probe(name, spec.args);
    const text = `${result.stdout}\n${result.stderr}`;
    const version = result.ok && spec.pattern ? (text.match(spec.pattern)?.[1] ?? null) : null;
    tools[name] = { found: result.ok, version };
  }
  let macosVersion = null;
  if (os === "macos") {
    const result = await probe("sw_vers", ["-productVersion"]);
    if (result.ok) macosVersion = result.stdout.trim() || null;
  }
  return { os, rawPlatform, arch, macosVersion, tools };
}

/** Returns the major macOS version as a number, or null when unknown. */
export function macosMajor(env) {
  if (env.os !== "macos" || !env.macosVersion) return null;
  const major = Number(env.macosVersion.split(".")[0]);
  return Number.isFinite(major) ? major : null;
}

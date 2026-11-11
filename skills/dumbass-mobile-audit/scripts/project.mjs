import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * @typedef {{ platform: "ios" | "android" | "react-native", framework: string, evidence: string[] }} Candidate
 * @typedef {{
 *   root: string, projectId: string, candidates: Candidate[], notes: string[],
 *   ios: { swiftuiFiles: number, uikitFiles: number, hasPackageSwift: boolean, hasXcodeProject: boolean },
 *   android: { hasGradleBuild: boolean, hasWrapper: boolean, compose: boolean, composePreviews: number, layoutXml: number, gradleVersion: string | null, kotlinVersion: string | null, agpVersion: string | null, usesPaparazzi: boolean, usesMugshot: boolean },
 *   reactNative: { present: boolean, expo: boolean, version: string | null, hasIos: boolean, hasAndroid: boolean }
 * }} ProjectInfo
 */

const SKIP_DIRS = new Set(["node_modules", ".git", "Pods", "build", "DerivedData", ".gradle", "dist", ".dumbass-runs", ".idea", ".build", "vendor"]);
const MAX_ENTRIES = 6000;
const MAX_DEPTH = 7;
const MAX_TEXT_FILES = 300;
const HEAD_BYTES = 16 * 1024;

export function sanitizeProjectId(name) {
  const cleaned = String(name).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^[^a-zA-Z0-9]+/, "").slice(0, 100);
  return cleaned || "project";
}

async function head(file) {
  try {
    const text = await readFile(file, "utf8");
    return text.length > HEAD_BYTES ? text.slice(0, HEAD_BYTES) : text;
  } catch {
    return "";
  }
}

/** Collects file paths (relative, forward slashes) with bounded depth and count. */
async function walk(root) {
  /** @type {string[]} */
  const files = [];
  let entries = 0;
  async function visit(dir, depth) {
    if (depth > MAX_DEPTH || entries >= MAX_ENTRIES) return;
    let list;
    try { list = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of list) {
      if (++entries > MAX_ENTRIES) return;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        // An .xcodeproj is a directory that signals an iOS project, so record it before skipping contents.
        if (entry.name.endsWith(".xcodeproj") || entry.name.endsWith(".xcworkspace")) files.push(`${path.relative(root, full).split(path.sep).join("/")}/`);
        if (!SKIP_DIRS.has(entry.name)) await visit(full, depth + 1);
      } else {
        files.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  }
  await visit(root, 0);
  return files;
}

function tomlValue(text, key) {
  const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, "mi"));
  return match?.[1] ?? null;
}

/**
 * Inspects a project directory to decide which renderer families could apply.
 * This is controller-side inspection. The result holds paths, counts and versions only, never source
 * text, so nothing from it needs to reach an evaluator.
 * @param {string} dir
 * @returns {Promise<ProjectInfo>}
 */
export async function detectProject(dir) {
  const root = path.resolve(dir);
  const info = await stat(root).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`Project directory not found: ${dir}`);
  const files = await walk(root);
  const has = (re) => files.filter((f) => re.test(f));

  const swiftFiles = has(/\.swift$/).slice(0, MAX_TEXT_FILES);
  let swiftuiFiles = 0;
  let uikitFiles = 0;
  const swiftuiEvidence = [];
  const uikitEvidence = [];
  for (const file of swiftFiles) {
    const text = await head(path.join(root, file));
    if (/^\s*import\s+SwiftUI\b/m.test(text)) { swiftuiFiles += 1; if (swiftuiEvidence.length < 3) swiftuiEvidence.push(file); }
    if (/^\s*import\s+UIKit\b/m.test(text)) { uikitFiles += 1; if (uikitEvidence.length < 3) uikitEvidence.push(file); }
  }
  const ios = {
    swiftuiFiles,
    uikitFiles,
    hasPackageSwift: files.includes("Package.swift"),
    hasXcodeProject: files.some((f) => /\.xcodeproj\/$|\.xcworkspace\/$/.test(f)),
  };

  const gradleFiles = has(/(^|\/)(build|settings)\.gradle(\.kts)?$/);
  const catalog = await head(path.join(root, "gradle/libs.versions.toml"));
  const wrapperProps = await head(path.join(root, "gradle/wrapper/gradle-wrapper.properties"));
  let composeFiles = 0;
  let usesPaparazzi = false;
  let usesMugshot = false;
  let gradleText = catalog;
  for (const file of gradleFiles.slice(0, 40)) gradleText += `\n${await head(path.join(root, file))}`;
  if (/androidx\.compose|org\.jetbrains\.kotlin\.plugin\.compose|compose\s*=\s*true/.test(gradleText)) composeFiles += 1;
  if (/app\.cash\.paparazzi/.test(gradleText)) usesPaparazzi = true;
  if (/uk\.co\.fractalmotion\.mugshot/.test(gradleText)) usesMugshot = true;
  let composePreviews = 0;
  for (const file of has(/\.kt$/).slice(0, MAX_TEXT_FILES)) {
    const text = await head(path.join(root, file));
    if (/@Preview\b/.test(text) && /@Composable\b/.test(text)) composePreviews += (text.match(/@Preview\b/g) ?? []).length;
  }
  const layoutXml = has(/(^|\/)res\/layout[^/]*\/[^/]+\.xml$/).length;
  const android = {
    hasGradleBuild: gradleFiles.length > 0 && has(/AndroidManifest\.xml$/).length > 0,
    hasWrapper: files.includes("gradlew") || files.includes("gradlew.bat"),
    compose: composeFiles > 0,
    composePreviews,
    layoutXml,
    gradleVersion: wrapperProps.match(/gradle-([\d.]+)(?:-[a-z]+)?\.zip/)?.[1] ?? null,
    kotlinVersion: tomlValue(catalog, "kotlin"),
    agpVersion: tomlValue(catalog, "agp"),
    usesPaparazzi,
    usesMugshot,
  };

  let reactNative = { present: false, expo: false, version: null, hasIos: false, hasAndroid: false };
  if (files.includes("package.json")) {
    try {
      const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps["react-native"]) {
        reactNative = {
          present: true,
          expo: Boolean(deps.expo),
          version: String(deps["react-native"]),
          hasIos: files.some((f) => f.startsWith("ios/")),
          hasAndroid: files.some((f) => f.startsWith("android/")),
        };
      }
    } catch { /* an unreadable package.json is simply not evidence of React Native */ }
  }

  /** @type {Candidate[]} */
  const candidates = [];
  if (reactNative.present) candidates.push({ platform: "react-native", framework: "react-native", evidence: ["package.json"] });
  // A React Native project also contains ios/ and android/ native shells; those are not separate native apps.
  if (!reactNative.present) {
    if (swiftuiFiles > 0) candidates.push({ platform: "ios", framework: "swiftui", evidence: swiftuiEvidence });
    if (uikitFiles > 0) candidates.push({ platform: "ios", framework: "uikit", evidence: uikitEvidence });
    if (android.hasGradleBuild && android.compose) candidates.push({ platform: "android", framework: "compose", evidence: gradleFiles.slice(0, 3) });
    if (android.hasGradleBuild && layoutXml > 0) candidates.push({ platform: "android", framework: "android-views", evidence: has(/res\/layout[^/]*\/[^/]+\.xml$/).slice(0, 3) });
  }

  const notes = [];
  if (!reactNative.present && swiftuiFiles > 0 && uikitFiles > 0) notes.push("Both SwiftUI and UIKit sources were found; ask which screens use which framework.");
  if (files.length >= MAX_ENTRIES) notes.push("The project is large; detection stopped at its scan limit and may be incomplete.");

  return { root, projectId: sanitizeProjectId(path.basename(root)), candidates, notes, ios, android, reactNative };
}

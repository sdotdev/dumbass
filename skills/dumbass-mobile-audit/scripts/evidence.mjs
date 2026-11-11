import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ContractError, METHODS, SCHEMA_VERSION, STATIC_EVIDENCE_LIMITS,
  assertClassification, classificationFor, isApproximate,
} from "./contracts.mjs";

/** @typedef {{ mediaType: "image/png" | "image/webp", width: number, height: number }} ImageInfo */

const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
export const RENDERS_DIR = "renders";
export const MANIFEST_FILE = `${RENDERS_DIR}/render-manifest.json`;
export const MAPPING_FILE = `${RENDERS_DIR}/evaluator-mapping.json`;
export const EVALUATOR_DIR = `${RENDERS_DIR}/evaluator-input`;

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Reads format and pixel size from the header. Only PNG and WebP are accepted: they are what the
 * supported renderers produce, and anything else is not evidence this suite can describe.
 * @param {Uint8Array} bytes
 * @returns {ImageInfo | null}
 */
export function readImageInfo(bytes) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length >= 24 && b.subarray(0, 8).equals(PNG_SIGNATURE) && b.toString("ascii", 12, 16) === "IHDR") {
    const width = b.readUInt32BE(16);
    const height = b.readUInt32BE(20);
    return width > 0 && height > 0 ? { mediaType: "image/png", width, height } : null;
  }
  if (b.length >= 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8X") return { mediaType: "image/webp", width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === "VP8L" && b[20] === 0x2f) {
      const bits = b.readUInt32LE(21);
      return { mediaType: "image/webp", width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    if (kind === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return { mediaType: "image/webp", width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    }
  }
  return null;
}

const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

/**
 * Removes metadata that could carry file paths, device names or tool details, without touching
 * pixel data. Evaluators must see pixels only.
 * @param {Uint8Array} bytes
 * @returns {Buffer}
 */
export function stripImageMetadata(bytes) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const info = readImageInfo(b);
  if (!info) throw new ContractError("Not a PNG or WebP image");
  if (info.mediaType === "image/png") {
    const parts = [b.subarray(0, 8)];
    let pos = 8;
    while (pos + 12 <= b.length) {
      const length = b.readUInt32BE(pos);
      const type = b.toString("ascii", pos + 4, pos + 8);
      const end = pos + 12 + length;
      if (end > b.length) throw new ContractError("Truncated PNG chunk");
      if (!PNG_DROP.has(type)) parts.push(b.subarray(pos, end));
      pos = end;
      if (type === "IEND") break;
    }
    return Buffer.concat(parts);
  }
  // WebP: drop EXIF and XMP chunks, clear their flags, and rewrite the RIFF size.
  const chunks = [];
  let pos = 12;
  while (pos + 8 <= b.length) {
    const type = b.toString("ascii", pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    const end = pos + 8 + size + (size % 2);
    if (end > b.length + 1) throw new ContractError("Truncated WebP chunk");
    let chunk = Buffer.from(b.subarray(pos, Math.min(end, b.length)));
    if (type === "VP8X") chunk[8] &= ~(0x08 | 0x04);
    if (type !== "EXIF" && type !== "XMP ") chunks.push(chunk);
    pos = end;
  }
  const body = Buffer.concat([Buffer.from("WEBP"), ...chunks]);
  const header = Buffer.alloc(8);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

/** @param {{ runId: string, requestedScreens: string[] }} input */
export function createManifest({ runId, requestedScreens }) {
  if (!ID.test(runId)) throw new ContractError(`Invalid run id ${runId}`);
  return {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    session: { status: "incomplete", requested_screens: [...new Set(requestedScreens)], reasons: ["Rendering has not finished"] },
    renders: [],
  };
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+/, "").replace(/-+$/, "").slice(0, 80) || "screen";
}

function uniqueId(manifest, wanted) {
  let id = wanted;
  for (let n = 2; manifest.renders.some((r) => r.screenshot_id === id); n += 1) id = `${wanted}-${n}`;
  return id;
}

/** Checks the pieces that every entry, captured or not, must get right. */
function entryBase(manifest, input) {
  const { method, framework, platform } = input;
  const descriptor = METHODS[method];
  if (!descriptor) throw new ContractError(`Unknown capture method ${method}`);
  if (!descriptor.platforms.includes(platform)) throw new ContractError(`Method ${method} does not capture platform ${platform}`);
  const classification = classificationFor(method, framework);
  if (!classification) throw new ContractError(`Method ${method} cannot render framework ${framework}`);
  assertClassification(method, classification, framework);
  const location = input.execution.location;
  if (!descriptor.locations.includes(location)) throw new ContractError(`Method ${method} cannot run ${location}`);
  if (!descriptor.hostOs.includes(input.execution.os)) throw new ContractError(`Method ${method} cannot run on ${input.execution.os}`);
  if (platform === "react-native") {
    const expected = method === "xcode-simulator" ? "ios" : method === "android-device" ? "android" : null;
    if (!expected || input.nativePlatform !== expected) throw new ContractError("A React Native capture must come from a native runtime and name its native platform");
  } else if (input.nativePlatform) {
    throw new ContractError("native_platform is only valid for React Native captures");
  }
  if (location === "remote" && !input.execution.remote) throw new ContractError("Remote captures must carry remote provenance");
  if (location === "local" && input.execution.remote) throw new ContractError("Local captures must not carry remote provenance");
  const execution = { location, os: input.execution.os, toolchain: input.execution.toolchain ?? null, ...(location === "remote" ? { remote: input.execution.remote } : {}) };
  const entry = {
    screenshot_id: "",
    status: "captured",
    platform,
    ...(platform === "react-native" ? { native_platform: input.nativePlatform } : {}),
    framework,
    renderer: { name: descriptor.name, version: input.rendererVersion ?? null, method, classification },
    execution,
    theme: input.theme ?? "unspecified",
    ui_state: input.uiState ?? "default",
    screen_id: input.screenId,
    captured_at: input.capturedAt ?? new Date().toISOString(),
    revision: input.revision ?? null,
    source_project_id: input.projectId,
    limitations: [...new Set([...descriptor.limitations, ...(input.limitations ?? [])])],
  };
  if (!ID.test(entry.source_project_id)) throw new ContractError("source project id is not a valid identifier");
  return { entry, descriptor, classification };
}

/**
 * Imports one captured image into the run and records its provenance. Refuses a classification the
 * method cannot support, and labels approximate renders instead of calling them captured.
 * @param {ReturnType<typeof createManifest>} manifest
 * @param {string} runDir
 * @param {object} input
 */
export async function addCapture(manifest, runDir, input) {
  const { entry, descriptor, classification } = entryBase(manifest, input);
  const bytes = await readFile(input.sourceFile);
  const info = readImageInfo(bytes);
  if (!info) throw new ContractError(`${path.basename(input.sourceFile)} is not a PNG or WebP image`);
  if (!descriptor.mediaTypes.includes(info.mediaType)) throw new ContractError(`${descriptor.name} does not produce ${info.mediaType}`);
  const device = input.device;
  if (!(device?.width > 0) || !(device?.height > 0)) throw new ContractError("Device logical width and height are required");
  const scale = device.scale_factor ?? info.width / device.width;
  entry.status = isApproximate(classification) ? "approximate" : "captured";
  entry.screenshot_id = uniqueId(manifest, slug(input.screenshotId ?? `${input.platform}-${input.screenId}-${entry.theme}`));
  const ext = info.mediaType === "image/webp" ? "webp" : "png";
  const relative = `${RENDERS_DIR}/screenshots/${input.platform}/${entry.screenshot_id}.${ext}`;
  await mkdir(path.dirname(path.join(runDir, relative)), { recursive: true });
  await writeFile(path.join(runDir, relative), bytes);
  entry.device = {
    ...(device.name ? { name: device.name } : {}),
    width: device.width, height: device.height,
    pixel_width: info.width, pixel_height: info.height,
    scale_factor: scale,
    orientation: info.width > info.height ? "landscape" : "portrait",
  };
  if (Math.abs(info.width / device.width - scale) > 0.01 * scale) {
    entry.limitations.push(`Pixel size ${info.width} wide does not match logical width ${device.width} at scale ${scale}; the tool downscaled or the device size was supplied approximately`);
  }
  entry.file = { path: relative, sha256: sha256Hex(bytes), media_type: info.mediaType };
  manifest.renders.push(entry);
  return entry;
}

/**
 * Records a screen that has no usable screenshot, so a report can never look complete by omission.
 * @param {ReturnType<typeof createManifest>} manifest
 * @param {object} input status is failed, unsupported or missing, with code and message
 */
export function addFailure(manifest, input) {
  if (!["failed", "unsupported", "missing"].includes(input.status)) throw new ContractError("Failure status must be failed, unsupported or missing");
  if (!input.code || !input.message) throw new ContractError("A failure needs a code and a message");
  const { entry } = entryBase(manifest, input);
  entry.status = input.status;
  entry.screenshot_id = uniqueId(manifest, slug(input.screenshotId ?? `${input.platform}-${input.screenId}-${input.status}`));
  entry.failure = { code: input.code, message: input.message };
  manifest.renders.push(entry);
  return entry;
}

/** Marks the session complete only if every requested screen has an image and nothing failed. */
export function finalizeManifest(manifest) {
  const reasons = [];
  for (const screen of manifest.session.requested_screens) {
    const entries = manifest.renders.filter((r) => r.screen_id === screen);
    if (!entries.length) reasons.push(`Screen ${screen}: no render was attempted`);
    else if (!entries.some((r) => r.status === "captured" || r.status === "approximate")) reasons.push(`Screen ${screen}: no usable screenshot (${entries.map((r) => r.status).join(", ")})`);
  }
  for (const r of manifest.renders) if (r.status === "failed" || r.status === "unsupported" || r.status === "missing") reasons.push(`${r.screenshot_id}: ${r.status} (${r.failure?.code})`);
  manifest.session.status = reasons.length ? "incomplete" : "complete";
  manifest.session.reasons = reasons;
  return manifest;
}

/**
 * Semantic checks beyond the JSON schema. Returns a list of problems; empty means consistent.
 * @param {any} manifest
 * @param {{ runDir?: string }} [options] when given, files are read and hashed
 */
export async function validateRenderManifest(manifest, options = {}) {
  const problems = [];
  if (manifest?.schema_version !== SCHEMA_VERSION) problems.push("unsupported schema_version");
  const seen = new Set();
  for (const r of manifest?.renders ?? []) {
    const label = r.screenshot_id;
    if (seen.has(label)) problems.push(`${label}: duplicate screenshot id`);
    seen.add(label);
    try {
      assertClassification(r.renderer.method, r.renderer.classification, r.framework);
      const descriptor = METHODS[r.renderer.method];
      if (!descriptor.platforms.includes(r.platform)) problems.push(`${label}: method ${r.renderer.method} does not capture ${r.platform}`);
      if (!descriptor.hostOs.includes(r.execution.os)) problems.push(`${label}: method ${r.renderer.method} cannot run on ${r.execution.os}`);
      if (!descriptor.locations.includes(r.execution.location)) problems.push(`${label}: method ${r.renderer.method} cannot run ${r.execution.location}`);
    } catch (error) {
      problems.push(`${label}: ${error.message}`);
    }
    const approximate = isApproximate(r.renderer.classification);
    if (approximate && r.status === "captured") problems.push(`${label}: an approximate classification must have status approximate`);
    if (!approximate && r.status === "approximate") problems.push(`${label}: status approximate requires an approximate classification`);
    if (r.execution.location === "remote" && !r.execution.remote) problems.push(`${label}: remote capture without provenance`);
    if (r.execution.location === "local" && r.execution.remote) problems.push(`${label}: local capture with remote provenance`);
    if (!Array.isArray(r.limitations) || !r.limitations.length) problems.push(`${label}: no limitations recorded`);
    if (r.status === "captured" || r.status === "approximate") {
      if (!r.file) { problems.push(`${label}: ${r.status} entry has no file`); continue; }
      if (!r.file.path.startsWith(`${RENDERS_DIR}/screenshots/`) || r.file.path.includes("..") || path.isAbsolute(r.file.path)) problems.push(`${label}: file path escapes the screenshots directory`);
      if (options.runDir) {
        let bytes;
        try { bytes = await readFile(path.join(options.runDir, r.file.path)); } catch { problems.push(`${label}: file ${r.file.path} is missing`); continue; }
        if (sha256Hex(bytes) !== r.file.sha256) problems.push(`${label}: file hash does not match the manifest`);
        const info = readImageInfo(bytes);
        if (!info) problems.push(`${label}: file is not a PNG or WebP image`);
        else {
          if (info.mediaType !== r.file.media_type) problems.push(`${label}: media type differs from the file`);
          if (info.width !== r.device?.pixel_width || info.height !== r.device?.pixel_height) problems.push(`${label}: pixel size differs from the file`);
        }
      }
    } else if (!r.failure) {
      problems.push(`${label}: ${r.status} entry has no failure reason`);
    }
  }
  const usable = new Set((manifest?.renders ?? []).filter((r) => r.status === "captured" || r.status === "approximate").map((r) => r.screen_id));
  if (manifest?.session?.status === "complete") {
    for (const screen of manifest.session.requested_screens) if (!usable.has(screen)) problems.push(`session is complete but ${screen} has no screenshot`);
    for (const r of manifest.renders) if (r.status === "failed" || r.status === "unsupported" || r.status === "missing") problems.push(`session is complete but ${r.screenshot_id} is ${r.status}`);
  }
  return problems;
}

export async function writeManifest(runDir, manifest) {
  await mkdir(path.join(runDir, RENDERS_DIR), { recursive: true });
  await writeFile(path.join(runDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function readManifest(runDir) {
  return JSON.parse(await readFile(path.join(runDir, MANIFEST_FILE), "utf8"));
}

/**
 * Builds the only thing an evaluator receives: neutral-named, metadata-stripped images in their own
 * folder. Renderer names, file names, screen identifiers and tool output stay in the controller-side
 * mapping, because they can hint at implementation. Approximate renders are excluded unless the
 * caller explicitly allows them.
 * @param {any} manifest
 * @param {string} runDir
 * @param {{ includeApproximate?: boolean }} [options]
 */
export async function prepareEvaluatorInput(manifest, runDir, options = {}) {
  const problems = await validateRenderManifest(manifest, { runDir });
  if (problems.length) throw new ContractError(`Render manifest failed validation: ${problems.join("; ")}`);
  const outDir = path.join(runDir, EVALUATOR_DIR);
  await mkdir(outDir, { recursive: true });
  const images = [];
  const excluded = [];
  const mapping = [];
  let n = 0;
  for (const r of manifest.renders) {
    if (r.status === "approximate" && !options.includeApproximate) { excluded.push({ screenshot_id: r.screenshot_id, reason: "approximate render not approved for evaluation" }); continue; }
    if (r.status !== "captured" && r.status !== "approximate") { excluded.push({ screenshot_id: r.screenshot_id, reason: r.status }); continue; }
    n += 1;
    const ext = r.file.media_type === "image/webp" ? "webp" : "png";
    const label = `screen-${String(n).padStart(3, "0")}`;
    const stripped = stripImageMetadata(await readFile(path.join(runDir, r.file.path)));
    const target = path.join(outDir, `${label}.${ext}`);
    await writeFile(target, stripped);
    images.push({ label, path: target });
    mapping.push({ label, screenshot_id: r.screenshot_id, sha256_original: r.file.sha256, sha256_evaluator: sha256Hex(stripped), classification: r.renderer.classification, status: r.status });
  }
  await writeFile(path.join(runDir, MAPPING_FILE), `${JSON.stringify({ run_id: manifest.run_id, mapping }, null, 2)}\n`);
  return { images, excluded, mapping };
}

/** True when a directory holds only image files with neutral names and nothing else. */
export async function isScreenshotOnly(dir) {
  const names = await readdir(dir);
  return names.length > 0 && names.every((name) => /^screen-\d{3}\.(png|webp)$/.test(name));
}

/**
 * Writes frame records for static evaluation sessions from the evaluator images, so the observer's
 * hash and reference checks cover rendered screens exactly as they cover any other frame.
 * Frame metadata sidecars are written next to each image as <frame_id>.json.
 */
export async function materializeFrames(manifest, runDir, sessions) {
  const mappingFile = JSON.parse(await readFile(path.join(runDir, MAPPING_FILE), "utf8"));
  const written = [];
  for (const session of sessions) {
    if (!ID.test(session)) throw new ContractError(`Invalid session id ${session}`);
    for (const item of mappingFile.mapping) {
      const render = manifest.renders.find((r) => r.screenshot_id === item.screenshot_id);
      const source = path.join(runDir, EVALUATOR_DIR, `${item.label}.${render.file.media_type === "image/webp" ? "webp" : "png"}`);
      const frameId = `${session}-${item.label}`;
      const relative = `sessions/${session}/frames/${frameId}${path.extname(source)}`;
      await mkdir(path.dirname(path.join(runDir, relative)), { recursive: true });
      await copyFile(source, path.join(runDir, relative));
      const record = {
        schema_version: SCHEMA_VERSION, run_id: manifest.run_id, session_id: session, frame_id: frameId,
        captured_at: render.captured_at, path: relative, sha256: item.sha256_evaluator,
        width: render.device.pixel_width, height: render.device.pixel_height,
        viewport: { width: Math.max(1, Math.round(render.device.width)), height: Math.max(1, Math.round(render.device.height)), device_scale_factor: render.device.scale_factor },
        scroll: { x: 0, y: 0 }, coordinate_space: "screenshot-pixels", redactions: [],
      };
      await writeFile(path.join(runDir, `sessions/${session}/frames/${frameId}.json`), `${JSON.stringify(record, null, 2)}\n`);
      written.push({ session, frame_id: frameId, path: relative });
    }
  }
  return written;
}

/**
 * The limitations a mobile report must carry: what each method cannot show, what is approximate,
 * where it ran, and what static screenshots can never establish.
 */
export function limitationsFor(manifest) {
  const out = [];
  const add = (text) => { if (!out.includes(text)) out.push(text); };
  for (const r of manifest.renders) for (const l of r.limitations) add(`${r.renderer.name}: ${l}`);
  for (const r of manifest.renders) {
    if (r.status === "approximate") add(`${r.screenshot_id} is an approximate render (${r.renderer.classification}), not genuine ${r.platform} platform output`);
    if (r.execution.location === "remote") add(`Rendered remotely on a GitHub-hosted ${r.execution.os} runner (run ${r.execution.remote?.run_id ?? "unknown"}) at revision ${r.execution.remote?.revision}`);
    if (r.platform === "mobile-web" && r.framework === "web") add("Web rendering: it shows the web build, not how a native app looks");
  }
  for (const reason of manifest.session.reasons) if (manifest.session.status === "incomplete") add(`Incomplete rendering session: ${reason}`);
  for (const l of STATIC_EVIDENCE_LIMITS) add(l);
  return out;
}

/** A capabilities record for a static mobile run, ready to write as capabilities.json. */
export function capabilityRecord(manifest, options = {}) {
  return {
    schema_version: SCHEMA_VERSION,
    host: options.host ?? "dumbass-mobile-renderer",
    adapter_version: options.adapterVersion ?? "0.1.0",
    mode: "static",
    capabilities: {
      screenshots: manifest.renders.some((r) => r.status === "captured" || r.status === "approximate"),
      coordinate_actions: false, keyboard: false,
      isolated_sessions: Boolean(options.isolatedSessions),
      baseline_reset: false, enforced_tool_boundary: Boolean(options.enforcedToolBoundary), native_device: false,
    },
    limitations: limitationsFor(manifest),
  };
}

/** Collects PNG and WebP files modified at or after a time, so previously committed goldens are not mistaken for new output. */
export async function collectImages(dir, { since = 0 } = {}) {
  const found = [];
  async function visit(current) {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (/\.(png|webp)$/i.test(entry.name) && (await stat(full)).mtimeMs >= since) found.push(full);
    }
  }
  await visit(dir);
  return found.sort();
}

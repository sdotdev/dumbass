import { crc32, deflateSync } from "node:zlib";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

/** A valid RGB PNG with a deterministic pattern. Optional text chunks simulate tool metadata. */
export function makePng(width = 4, height = 8, { text = [], seed = 0 } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width * 3; x += 1) row[1 + x] = (x * 7 + y * 13 + seed) & 255;
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...text.map((t) => chunk("tEXt", Buffer.from(t, "latin1"))),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A WebP container with just enough structure for header and metadata tests. */
export function makeWebp({ width = 8, height = 16, exif = false, kind = "VP8L" } = {}) {
  const chunks = [];
  if (exif) {
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x08; // EXIF flag
    vp8x.writeUIntLE(width - 1, 4, 3);
    vp8x.writeUIntLE(height - 1, 7, 3);
    chunks.push(riff("VP8X", vp8x));
  }
  if (kind === "VP8L") {
    const data = Buffer.alloc(10);
    data[0] = 0x2f;
    data.writeUInt32LE((width - 1) | ((height - 1) << 14), 1);
    chunks.push(riff("VP8L", data));
  } else {
    const data = Buffer.alloc(10);
    data[3] = 0x9d; data[4] = 0x01; data[5] = 0x2a;
    data.writeUInt16LE(width, 6);
    data.writeUInt16LE(height, 8);
    chunks.push(riff("VP8 ", data));
  }
  if (exif) chunks.push(riff("EXIF", Buffer.from("secret-device-name")));
  const body = Buffer.concat([Buffer.from("WEBP"), ...chunks]);
  const header = Buffer.alloc(8);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function riff(type, data) {
  const header = Buffer.alloc(8);
  header.write(type, 0, "ascii");
  header.writeUInt32LE(data.length, 4);
  const pad = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([header, data, pad]);
}

const NONE = { found: false, version: null };
const found = (version = "1.0") => ({ found: true, version });

/** An environment snapshot. tools lists the tools that exist; everything else is absent. */
export function makeEnv(os, tools = {}, extra = {}) {
  const base = Object.fromEntries(["xcodebuild", "xcrun", "swift", "swiftui-render", "java", "gradle", "adb", "node", "git", "gh"].map((n) => [n, NONE]));
  for (const [name, value] of Object.entries(tools)) base[name] = value === true ? found() : value;
  return { os, rawPlatform: os, arch: "arm64", macosVersion: os === "macos" ? "15.0" : null, tools: base, ...extra };
}
export { found };

/** A throwaway directory tree: { "path/inside": "text" | Buffer }. */
export async function makeTree(files) {
  const root = await mkdtemp(path.join(tmpdir(), "dumbass-test-"));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

/** Records every call so a test can prove that something did not happen. */
export function spyTransport(overrides = {}) {
  const calls = [];
  const wrap = (name, impl) => async (args) => { calls.push({ name, args }); return impl(args); };
  const transport = {
    workflowExists: wrap("workflowExists", async () => true),
    dispatch: wrap("dispatch", async () => ({ runId: "9001" })),
    waitForRun: wrap("waitForRun", async () => ({ conclusion: "success" })),
    download: wrap("download", async ({ directory }) => {
      await writeFile(path.join(directory, "login.png"), makePng(780, 1688));
      return [directory];
    }),
    deleteArtifact: wrap("deleteArtifact", async () => true),
  };
  for (const [name, impl] of Object.entries(overrides)) transport[name] = wrap(name, impl);
  return { transport, calls };
}

export const SHA = "a".repeat(40);
export const SHA2 = "b".repeat(40);

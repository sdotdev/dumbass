import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { captureMobileWeb } from "../../src/mobile-web.mjs";
import { addCapture, createManifest, finalizeManifest, isScreenshotOnly, prepareEvaluatorInput, readImageInfo, validateRenderManifest } from "../../src/evidence.mjs";
import { makeTree } from "../helpers.mjs";

// Real Chromium against the repository's own deterministic fixture server. Run with: npm run test:browser
const here = path.dirname(fileURLToPath(import.meta.url));
const { createFixtureServer } = await import(pathToFileURL(path.resolve(here, "../../../../evals/server.mjs")).href);

test("a real mobile viewport capture flows through the evidence pipeline as mobile-web evidence", async (t) => {
  const server = createFixtureServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = await makeTree({});
  const runDir = path.join(dir, "run");
  const executablePath = process.env.UX_EVAL_CHROMIUM;
  const launcher = executablePath ? async () => (await import("playwright")).chromium.launch({ executablePath }) : undefined;

  const shot = await captureMobileWeb({ url: `${base}/app/f05`, profile: "iphone-14", theme: "light", outFile: path.join(dir, "f05.png"), launcher, waitMs: 200 });
  const info = readImageInfo(await readFile(shot.file));
  assert.deepEqual([info.mediaType, info.width, info.height], ["image/png", 390 * 3, 844 * 3], "viewport size times device scale factor");
  assert.match(shot.browser.version, /^\d+\./);
  assert.equal(shot.blockedRequests, 0, "the fixture makes no third-party requests");

  const manifest = createManifest({ runId: "browser-1", requestedScreens: ["trips"] });
  const entry = await addCapture(manifest, runDir, {
    sourceFile: shot.file, screenId: "trips", platform: "mobile-web", framework: "web", method: "browser-viewport",
    rendererVersion: `${shot.browser.name} ${shot.browser.version}`, execution: { location: "local", os: "linux", toolchain: "playwright" },
    device: shot.device, theme: shot.theme, projectId: "fixtures", capturedAt: shot.capturedAt,
  });
  assert.deepEqual([entry.status, entry.renderer.classification, entry.device.scale_factor], ["captured", "mobile-web", 3]);
  finalizeManifest(manifest);
  assert.deepEqual(await validateRenderManifest(manifest, { runDir }), []);

  const prepared = await prepareEvaluatorInput(manifest, runDir);
  assert.equal(await isScreenshotOnly(path.join(runDir, "renders/evaluator-input")), true);
  assert.deepEqual((await readdir(path.join(runDir, "renders/evaluator-input"))), ["screen-001.png"]);
  assert.equal(prepared.images.length, 1);
});

test("the profile scale and requested theme are recorded accurately for a second device profile", async (t) => {
  const server = createFixtureServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = await makeTree({});
  const executablePath = process.env.UX_EVAL_CHROMIUM;
  const launcher = executablePath ? async () => (await import("playwright")).chromium.launch({ executablePath }) : undefined;
  const a = await captureMobileWeb({ url: `${base}/app/f03`, profile: "pixel-7", theme: "light", outFile: path.join(dir, "l.png"), launcher });
  const b = await captureMobileWeb({ url: `${base}/app/f03`, profile: "pixel-7", theme: "dark", outFile: path.join(dir, "d.png"), launcher });
  assert.equal(readImageInfo(await readFile(a.file)).width, Math.round(412 * 2.625) , "scaled viewport width");
  assert.equal(a.theme, "light");
  assert.equal(b.theme, "dark");
});

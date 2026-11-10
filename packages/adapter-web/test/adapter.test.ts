import test from "node:test";
import assert from "node:assert/strict";
import { WebAdapter, type WebInputSurface } from "../src/index.ts";

function fixture(expectedScreenshotPixels = { width: 200, height: 160 }) {
  const calls: unknown[][] = [];
  const surface: WebInputSurface = {
    configureAllowedOrigins: async (...args) => { calls.push(["origins", ...args]); },
    currentUrl: async () => "https://example.test/path",
    screenshot: async () => ({ bytes: Uint8Array.of(7, 8), width: 200, height: 160, mimeType: "image/png" }),
    click: async (...args) => { calls.push(["click", ...args]); },
    tap: async (...args) => { calls.push(["tap", ...args]); },
    scroll: async (...args) => { calls.push(["scroll", ...args]); },
    swipe: async (...args) => { calls.push(["swipe", ...args]); },
    keypress: async (...args) => { calls.push(["keypress", ...args]); },
    type: async (...args) => { calls.push(["type", ...args]); },
    wait: async (...args) => { calls.push(["wait", ...args]); },
    close: async () => { calls.push(["close"]); },
  };
  return { calls, adapter: new WebAdapter(surface, { viewportCss: { width: 100, height: 80 }, expectedScreenshotPixels, now: () => new Date(0) }) };
}

test("captures only screenshot bytes and frame dimensions", async () => {
  const { adapter } = fixture();
  const result = await adapter.capture();
  assert.deepEqual([...result.screenshot], [7, 8]);
  assert.equal(result.width, 200);
  assert.equal(result.height, 160);
  assert.equal(result.captured_at, new Date(0).toISOString());
  assert.equal("dom" in result, false);
  assert.equal("text" in result, false);
});

test("delegates pre-navigation origin blocking to the trusted browser surface", async () => {
  const { adapter, calls } = fixture();
  await adapter.configureAllowedOrigins(["https://example.test"]);
  assert.deepEqual(calls[0], ["origins", ["https://example.test"]]);
  await assert.rejects(() => adapter.configureAllowedOrigins(["https://example.test/path"]), /canonical origins/);
});

test("maps screenshot pixel coordinates to CSS coordinates", async () => {
  const { adapter, calls } = fixture();
  await adapter.perform({ type: "click", frame_id: "r-0", x: 80, y: 40, classification: "local" });
  await adapter.perform({ type: "scroll", frame_id: "r-0", x: 10, y: 20, delta_x: 4, delta_y: 8, classification: "local" });
  assert.deepEqual(calls[0], ["click", 40, 20]);
  assert.deepEqual(calls[1], ["scroll", 5, 10, 2, 4]);
});

test("rejects unexpected screenshot dimensions to prevent coordinate drift", async () => {
  const { adapter } = fixture({ width: 100, height: 80 });
  await assert.rejects(() => adapter.capture(), /differ from configured/);
});

test("closes once and rejects further operations", async () => {
  const { adapter, calls } = fixture();
  await adapter.close();
  await adapter.close();
  assert.equal(calls.filter(call => call[0] === "close").length, 1);
  await assert.rejects(() => adapter.capture(), /closed/);
});

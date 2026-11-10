import test from "node:test";
import assert from "node:assert/strict";
import { VisualRunner, RunnerError, type ActionPolicy, type ArtifactSink, type AuditRun, type ProtocolEvent, type VisualAction, type VisualDriver, type VisualFrame } from "../src/index.ts";

function fixture(policy: ActionPolicy = { evaluate: () => ({ outcome: "allow" }) }, maxActions = 10) {
  const events: ProtocolEvent[] = [];
  const frames: VisualFrame[] = [];
  let captures = 0;
  const artifacts: ArtifactSink = {
    writeManifest: async () => {},
    writeFrame: async (frame) => { frames.push(frame); return { path: `frames/${frames.length}.png`, sha256: "a".repeat(64) }; },
    writeEvent: async (event) => { events.push(event); },
  };
  const actions: Exclude<VisualAction, { type: "stop" }>[] = [];
  const driver: VisualDriver = {
    configureAllowedOrigins: async () => {},
    currentUrl: async () => "https://example.test/path",
    capture: async () => ({ captured_at: new Date(0).toISOString(), width: 100, height: 80, mime_type: "image/png", screenshot: Uint8Array.of(++captures) }),
    perform: async (action) => { actions.push(action); },
  };
  const manifest: AuditRun = {
    schema_version: "1.0.0", run_id: "r1", created_at: new Date(0).toISOString(), suite_version: "test", mode: "interactive", profile: "web",
    target: { url: "https://example.test", allowed_origins: ["https://example.test"] },
    viewport: { width: 100, height: 80, device_scale_factor: 1 }, personas: ["novice"],
    tasks: [{ task_id: "t1", title: "Test", start_url: "https://example.test", success_criteria: ["done"] }],
    action_policy: { allowed_actions: ["click", "tap", "scroll", "swipe", "type", "keypress", "wait"], authorized_mutations: [] },
    budgets: { max_actions: maxActions, max_duration_seconds: 60 }, provenance: { host: "test", protocol_version: "1.0.0", skill_versions: { "dumbass-audit": "1.0.0" } },
  };
  const runner = new VisualRunner({ manifest, session_id: "s1", task_id: "t1", driver, artifacts, policy, frame_storage: { retention_days: 7, description: "test fixture", prepare: async (frame) => ({ screenshot: frame.screenshot, redactions: [] }) }, now: () => new Date(0) });
  return { runner, events, frames, actions, manifest, driver };
}

test("emits protocol observations and frame artifacts, then records action linkage", async () => {
  const f = fixture();
  const before = await f.runner.start();
  const after = await f.runner.act({ type: "click", frame_id: before.frame_id, x: 99, y: 79, classification: "local" });
  if (!after) throw new Error("Expected next frame");
  assert.notEqual(after.frame_id, before.frame_id);
  assert.equal(f.actions.length, 1);
  assert.deepEqual(f.events.map(e => e.type), ["observation", "action", "observation"]);
  const actionEvent = f.events.find(e => e.type === "action");
  assert.equal(actionEvent?.frame_id, before.frame_id);
  assert.equal(actionEvent?.next_frame_id, after.frame_id);
  const frameMetadata = f.events[0]?.extensions?.frame as Record<string, unknown>;
  assert.equal(frameMetadata?.coordinate_space, "screenshot-pixels");
  assert.equal(frameMetadata?.sha256, "a".repeat(64));
});

test("rejects stale frame actions before driver execution", async () => {
  const f = fixture();
  const first = await f.runner.start();
  await f.runner.act({ type: "wait", frame_id: first.frame_id, duration_ms: 0, classification: "local" });
  await assert.rejects(() => f.runner.act({ type: "click", frame_id: first.frame_id, x: 1, y: 1, classification: "local" }), (e: unknown) => e instanceof RunnerError && e.code === "stale-frame");
  assert.equal(f.actions.length, 1);
  assert.equal(f.events.at(-1)?.error_code, "STALE_FRAME");
});

test("rejects out-of-frame coordinates and does not call the driver", async () => {
  const f = fixture();
  const frame = await f.runner.start();
  await assert.rejects(() => f.runner.act({ type: "click", frame_id: frame.frame_id, x: 100, y: 0, classification: "local" }), (e: unknown) => e instanceof RunnerError && e.code === "invalid-action");
  assert.equal(f.actions.length, 0);
});

test("fails closed when policy denies or confirmation is missing", async () => {
  const denied = fixture({ evaluate: () => ({ outcome: "deny" as const, reason: "blocked" }) });
  const frame = await denied.runner.start();
  await assert.rejects(() => denied.runner.act({ type: "click", frame_id: frame.frame_id, x: 2, y: 2, classification: "local" }), (e: unknown) => e instanceof RunnerError && e.code === "policy-denied");
  assert.equal(denied.actions.length, 0);

  const confirmation = fixture({
    evaluate: () => ({ outcome: "confirm" as const, reason: "approve", authorization_id: "auth1" }),
    confirm: async () => true,
  });
  const frame2 = await confirmation.runner.start();
  await assert.rejects(() => confirmation.runner.act({ type: "click", frame_id: frame2.frame_id, x: 2, y: 2, classification: "local" }), (e: unknown) => e instanceof RunnerError && e.code === "confirmation-required");
  assert.equal(confirmation.actions.length, 0);
});

test("logs only redacted text details", async () => {
  const f = fixture();
  const frame = await f.runner.start();
  await f.runner.act({ type: "type", frame_id: frame.frame_id, text: "secret@example.test", classification: "local" });
  assert.equal(JSON.stringify(f.events).includes("secret@example.test"), false);
  const typeEvent = f.events.find(e => e.type === "action");
  assert.equal(typeEvent?.action?.text, "[omitted:19]");
});

test("blocks mutation without task-scoped authorization", async () => {
  const f = fixture();
  const frame = await f.runner.start();
  await assert.rejects(() => f.runner.act({ type: "click", frame_id: frame.frame_id, x: 2, y: 2, classification: "mutation" }), /authorization/);
  assert.equal(f.actions.length, 0);
  assert.equal(f.events.at(-1)?.error_code, "ACTION_REQUIRES_AUTHORIZATION");
});

test("stop action emits stop event and ends interaction", async () => {
  const f = fixture();
  const frame = await f.runner.start();
  assert.equal(await f.runner.act({ type: "stop", frame_id: frame.frame_id, reason: "done" }), null);
  await assert.rejects(() => f.runner.act({ type: "wait", frame_id: frame.frame_id, duration_ms: 1, classification: "local" }));
  assert.equal(f.actions.length, 0);
  assert.equal(f.events.at(-1)?.type, "stop");
});

test("finish is terminal and cannot be emitted twice or followed by actions", async () => {
  const f = fixture();
  const frame = await f.runner.start();
  await f.runner.finish("completed", "done", "success", 10);
  await assert.rejects(() => f.runner.act({ type: "wait", frame_id: frame.frame_id, duration_ms: 1, classification: "local" }), /stopped/);
  await assert.rejects(() => f.runner.finish("completed", "again", "duplicate", 11), /stopped/);
  assert.equal(f.events.filter(event => event.type === "result").length, 1);
});

test("enforces allowed origins in the trusted control plane", async () => {
  const f = fixture();
  const frame = await f.runner.start();
  f.driver.currentUrl = async () => "https://evil.example/path";
  await assert.rejects(() => f.runner.act({ type: "click", frame_id: frame.frame_id, x: 1, y: 1, classification: "navigation" }), (error: unknown) => error instanceof RunnerError && error.code === "policy-denied");
  assert.equal(f.events.at(-1)?.error_code, "TARGET_OUT_OF_SCOPE");
});

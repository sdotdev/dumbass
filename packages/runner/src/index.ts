export const SCHEMA_VERSION = "1.0.0" as const;

export type FrameId = string;
export type ActionClass = "navigation" | "local" | "mutation";
export type ActionType = "click" | "tap" | "scroll" | "swipe" | "type" | "keypress" | "wait";

export interface VisualFrame {
  readonly run_id: string;
  readonly session_id: string;
  readonly frame_id: FrameId;
  readonly captured_at: string;
  readonly width: number;
  readonly height: number;
  readonly viewport: { readonly width: number; readonly height: number; readonly device_scale_factor: number };
  readonly coordinate_space: "screenshot-pixels" | "css-viewport";
  /** Agent-visible data is only this rendered image. */
  readonly mime_type: "image/png" | "image/jpeg";
  readonly screenshot: Uint8Array;
}

export type VisualAction =
  | { readonly type: "click" | "tap"; readonly frame_id: FrameId; readonly x: number; readonly y: number; readonly classification: ActionClass; readonly authorization_id?: string }
  | { readonly type: "scroll"; readonly frame_id: FrameId; readonly x: number; readonly y: number; readonly delta_x: number; readonly delta_y: number; readonly classification: ActionClass; readonly authorization_id?: string }
  | { readonly type: "swipe"; readonly frame_id: FrameId; readonly x: number; readonly y: number; readonly to_x: number; readonly to_y: number; readonly duration_ms: number; readonly classification: ActionClass; readonly authorization_id?: string }
  | { readonly type: "keypress"; readonly frame_id: FrameId; readonly key: string; readonly classification: ActionClass; readonly authorization_id?: string }
  | { readonly type: "type"; readonly frame_id: FrameId; readonly text: string; readonly classification: ActionClass; readonly authorization_id?: string }
  | { readonly type: "wait"; readonly frame_id: FrameId; readonly duration_ms: number; readonly classification: ActionClass; readonly authorization_id?: string }
  | { readonly type: "stop"; readonly frame_id: FrameId; readonly reason: string };

export interface AuditRun {
  readonly schema_version: typeof SCHEMA_VERSION;
  readonly run_id: string;
  readonly created_at: string;
  readonly suite_version: string;
  readonly mode: "static" | "interactive";
  readonly profile: "web" | "dashboard" | "mobile-web" | "mobile-native";
  readonly target: { readonly url: string; readonly allowed_origins: readonly string[] };
  readonly viewport: { readonly width: number; readonly height: number; readonly device_scale_factor: number };
  readonly personas: readonly ("novice" | "expert")[];
  readonly tasks: readonly { readonly task_id: string; readonly title: string; readonly start_url: string; readonly success_criteria: readonly string[] }[];
  readonly action_policy: {
    readonly allowed_actions: readonly ActionType[];
    readonly authorized_mutations: readonly { readonly authorization_id: string; readonly task_id: string; readonly description: string }[];
  };
  readonly budgets: { readonly max_actions: number; readonly max_duration_seconds: number };
  readonly provenance: { readonly host: string; readonly protocol_version: typeof SCHEMA_VERSION; readonly model?: string; readonly skill_versions: Readonly<Record<string, string>> };
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export interface ProtocolAction {
  readonly type: ActionType;
  readonly x?: number;
  readonly y?: number;
  readonly to_x?: number;
  readonly to_y?: number;
  readonly delta_x?: number;
  readonly delta_y?: number;
  readonly text?: string;
  readonly key?: string;
  readonly duration_ms?: number;
  readonly classification: ActionClass;
  readonly authorization_id?: string;
}

export interface ProtocolEvent {
  readonly schema_version: typeof SCHEMA_VERSION;
  readonly run_id: string;
  readonly session_id: string;
  readonly event_id: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly type: "observation" | "action" | "result" | "stop" | "error";
  readonly frame_id?: FrameId;
  readonly next_frame_id?: FrameId;
  readonly action?: ProtocolAction;
  readonly observation?: string;
  readonly status: "ok" | "blocked" | "error" | "inconclusive";
  readonly error_code?: "CAPABILITY_MISSING" | "TARGET_OUT_OF_SCOPE" | "ACTION_REQUIRES_AUTHORIZATION" | "STALE_FRAME" | "TIMEOUT" | "BASELINE_RESET_FAILED" | "BUDGET_EXHAUSTED" | "INVALID_ARTIFACT";
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export interface ProtocolFrame {
  readonly schema_version: typeof SCHEMA_VERSION;
  readonly run_id: string;
  readonly session_id: string;
  readonly frame_id: string;
  readonly captured_at: string;
  readonly path: string;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly viewport: VisualFrame["viewport"];
  readonly scroll: { readonly x: number; readonly y: number };
  readonly coordinate_space: VisualFrame["coordinate_space"];
  readonly redactions: readonly { readonly reason: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export interface VisualDriver {
  /** Configure request interception before the first page action. The trusted surface must block disallowed origins before navigation. */
  configureAllowedOrigins(origins: readonly string[]): Promise<void>;
  /** Captures pixels only; never return DOM, accessibility data, or page text. */
  capture(): Promise<{ readonly captured_at: string; readonly width: number; readonly height: number; readonly mime_type: "image/png" | "image/jpeg"; readonly screenshot: Uint8Array; readonly scroll?: { readonly x: number; readonly y: number } }>;
  /** Trusted control-plane URL. It is used for origin enforcement and is never exposed to the persona. */
  currentUrl(): Promise<string>;
  perform(action: Exclude<VisualAction, { type: "stop" }>): Promise<void>;
  close?(): Promise<void>;
}

export type PolicyDecision =
  | { readonly outcome: "allow" }
  | { readonly outcome: "deny"; readonly reason: string; readonly error_code?: ProtocolEvent["error_code"] }
  | { readonly outcome: "confirm"; readonly reason: string; readonly authorization_id: string };

export interface ActionPolicy {
  evaluate(frame: VisualFrame, action: Exclude<VisualAction, { type: "stop" }>): Promise<PolicyDecision> | PolicyDecision;
  confirm?(decision: Extract<PolicyDecision, { outcome: "confirm" }>, frame: VisualFrame, action: Exclude<VisualAction, { type: "stop" }>): Promise<boolean>;
}

export interface ArtifactSink {
  writeManifest(manifest: AuditRun): Promise<void>;
  writeFrame(frame: VisualFrame, step: number): Promise<{ readonly path: string; readonly sha256: string }>;
  writeEvent(event: ProtocolEvent): Promise<void>;
}

export interface FrameStoragePolicy {
  readonly retention_days: number;
  readonly description: string;
  /** Return pixels safe to persist and the exact redacted regions. Throw to prevent persistence. */
  prepare(frame: VisualFrame): Promise<{ readonly screenshot: Uint8Array; readonly redactions: ProtocolFrame["redactions"] }>;
}

export interface RunnerOptions {
  readonly manifest: AuditRun;
  readonly session_id: string;
  readonly task_id: string;
  readonly driver: VisualDriver;
  readonly artifacts: ArtifactSink;
  readonly policy: ActionPolicy;
  readonly frame_storage: FrameStoragePolicy;
  readonly maxWaitMs?: number;
  readonly maxTextLength?: number;
  readonly now?: () => Date;
}

export class RunnerError extends Error {
  readonly code: "invalid-action" | "stale-frame" | "policy-denied" | "confirmation-required" | "step-limit" | "driver-error";
  constructor(message: string, code: "invalid-action" | "stale-frame" | "policy-denied" | "confirmation-required" | "step-limit" | "driver-error") {
    super(message);
    this.name = "RunnerError";
    this.code = code;
  }
}

export class VisualRunner {
  private current?: VisualFrame;
  private step = 0;
  private eventSequence = 0;
  private initialized = false;
  private stopped = false;
  private acting = false;
  private startedAtMs?: number;
  private readonly now: () => Date;

  private readonly options: RunnerOptions;
  constructor(options: RunnerOptions) {
    this.options = options;
    this.now = options.now ?? (() => new Date());
    if (!options.session_id) throw new Error("session_id is required");
    if (!Number.isInteger(options.frame_storage.retention_days) || options.frame_storage.retention_days < 0) throw new Error("A non-negative frame retention policy is required");
  }

  async start(): Promise<VisualFrame> {
    if (this.initialized) throw new RunnerError("Runner already started", "invalid-action");
    this.initialized = true;
    if (!this.options.manifest.tasks.some(task => task.task_id === this.options.task_id)) throw new RunnerError("task_id is not present in the run manifest", "invalid-action");
    await this.options.driver.configureAllowedOrigins(this.options.manifest.target.allowed_origins);
    await this.assertAllowedOrigin();
    this.startedAtMs = this.now().getTime();
    await this.options.artifacts.writeManifest(this.options.manifest);
    return this.captureFrame();
  }

  async act(action: VisualAction): Promise<VisualFrame | null> {
    if (!this.initialized || !this.current) throw new RunnerError("Call start() before act()", "invalid-action");
    if (this.stopped) throw new RunnerError("Run has stopped", "invalid-action");
    if (this.acting) throw new RunnerError("An action is already in progress", "invalid-action");
    this.acting = true;
    try { return await this.actExclusive(action); }
    finally { this.acting = false; }
  }

  async finish(status: "completed" | "partial" | "abandoned" | "blocked" | "inconclusive", summary: string, stopReason: string, durationMs: number): Promise<void> {
    if (!this.initialized) throw new RunnerError("Call start() before finish()", "invalid-action");
    if (this.stopped) throw new RunnerError("Run has stopped", "invalid-action");
    this.stopped = true;
    await this.emit({ type: "result", status: status === "completed" ? "ok" : status === "blocked" ? "blocked" : "inconclusive", observation: summary, extensions: { outcome_status: status, stop_reason: stopReason, actions: this.step, duration_ms: durationMs } });
    await this.options.driver.close?.();
  }

  get latestFrame(): VisualFrame | undefined { return this.current; }
  get actionsTaken(): number { return this.step; }

  private async actExclusive(action: VisualAction): Promise<VisualFrame | null> {
    const current = this.current;
    if (!current) throw new RunnerError("Call start() before act()", "invalid-action");
    if (action.frame_id !== current.frame_id) {
      await this.emit({ type: "error", frame_id: action.frame_id, status: "blocked", error_code: "STALE_FRAME", observation: "Action rejected because its screenshot is stale" });
      throw new RunnerError("Stale screenshot frame", "stale-frame");
    }
    if (action.type === "stop") {
      this.stopped = true;
      await this.emit({ type: "stop", frame_id: current.frame_id, status: "ok", observation: action.reason });
      return null;
    }
    if (this.startedAtMs !== undefined && this.now().getTime() - this.startedAtMs > this.options.manifest.budgets.max_duration_seconds * 1000) {
      await this.emit({ type: "error", frame_id: current.frame_id, status: "blocked", error_code: "BUDGET_EXHAUSTED", observation: "Run duration budget exhausted" });
      throw new RunnerError("Run duration budget exhausted", "step-limit");
    }
    try { this.validate(action, current); }
    catch (error) {
      await this.emit({ type: "error", frame_id: current.frame_id, status: "error", error_code: "INVALID_ARTIFACT", observation: error instanceof Error ? error.message : "Invalid action" });
      throw error;
    }
    if (++this.step > this.options.manifest.budgets.max_actions) {
      await this.emit({ type: "error", frame_id: current.frame_id, status: "blocked", error_code: "BUDGET_EXHAUSTED", observation: "Action budget exhausted" });
      throw new RunnerError("Action budget exhausted", "step-limit");
    }
    if (!this.options.manifest.action_policy.allowed_actions.includes(action.type)) {
      await this.emit({ type: "error", frame_id: current.frame_id, status: "blocked", error_code: "CAPABILITY_MISSING", observation: "Action type is not allowed by run policy" });
      throw new RunnerError("Action type is not allowed", "policy-denied");
    }
    if (action.classification === "mutation") {
      const authorized = this.options.manifest.action_policy.authorized_mutations.some(item => item.authorization_id === action.authorization_id && item.task_id === this.options.task_id);
      if (!authorized) {
        await this.emit({ type: "error", frame_id: current.frame_id, status: "blocked", error_code: "ACTION_REQUIRES_AUTHORIZATION", observation: "Mutation lacks task-scoped authorization" });
        throw new RunnerError("Mutation requires task-scoped authorization", "policy-denied");
      }
    }
    const decision = await this.options.policy.evaluate(current, action);
    if (decision.outcome === "deny") {
      await this.emit({ type: "error", frame_id: current.frame_id, status: "blocked", error_code: decision.error_code ?? "TARGET_OUT_OF_SCOPE", observation: decision.reason });
      throw new RunnerError(decision.reason, "policy-denied");
    }
    if (decision.outcome === "confirm") {
      const grantMatches = action.authorization_id === decision.authorization_id && this.options.manifest.action_policy.authorized_mutations.some(item => item.authorization_id === decision.authorization_id && item.task_id === this.options.task_id);
      const confirmed = grantMatches && await this.options.policy.confirm?.(decision, current, action) === true;
      if (!confirmed) {
        await this.emit({ type: "error", frame_id: current.frame_id, status: "blocked", error_code: "ACTION_REQUIRES_AUTHORIZATION", observation: decision.reason });
        throw new RunnerError(decision.reason, "confirmation-required");
      }
    }
    try {
      await this.options.driver.perform(action);
      await this.assertAllowedOrigin(current.frame_id);
      const nextFrameId = `${this.options.manifest.run_id}-${this.step}`;
      await this.emit({ type: "action", frame_id: current.frame_id, next_frame_id: nextFrameId, action: this.protocolAction(action), status: "ok" });
      const next = await this.captureFrame();
      return next;
    } catch (error) {
      if (error instanceof RunnerError) throw error;
      const detail = error instanceof Error ? error.message : "Unknown driver error";
      await this.emit({ type: "error", frame_id: current.frame_id, status: "error", error_code: "TIMEOUT", observation: detail });
      throw new RunnerError(detail, "driver-error");
    }
  }

  private validate(action: Exclude<VisualAction, { type: "stop" }>, frame: VisualFrame): void {
    const finite = (n: number) => Number.isFinite(n);
    const point = (x: number, y: number) => finite(x) && finite(y) && x >= 0 && y >= 0 && x < frame.width && y < frame.height;
    if ((action.type === "click" || action.type === "tap" || action.type === "scroll" || action.type === "swipe") && !point(action.x, action.y)) throw new RunnerError("Coordinates are outside the current screenshot", "invalid-action");
    if (action.type === "swipe" && (!point(action.to_x, action.to_y) || !Number.isInteger(action.duration_ms) || action.duration_ms < 0)) throw new RunnerError("Invalid swipe", "invalid-action");
    if (action.type === "scroll" && (!finite(action.delta_x) || !finite(action.delta_y) || Math.abs(action.delta_x) > 10000 || Math.abs(action.delta_y) > 10000)) throw new RunnerError("Invalid scroll delta", "invalid-action");
    if (action.type === "keypress" && (!action.key || action.key.length > 64)) throw new RunnerError("Invalid key", "invalid-action");
    if (action.type === "type" && (typeof action.text !== "string" || action.text.length > (this.options.maxTextLength ?? 4096))) throw new RunnerError("Typed text is invalid or too long", "invalid-action");
    if (action.type === "wait" && (!Number.isInteger(action.duration_ms) || action.duration_ms < 0 || action.duration_ms > (this.options.maxWaitMs ?? 10000))) throw new RunnerError("Wait is outside the allowed range", "invalid-action");
  }

  private async captureFrame(): Promise<VisualFrame> {
    const captured = await this.options.driver.capture();
    if (!Number.isInteger(captured.width) || captured.width < 1 || !Number.isInteger(captured.height) || captured.height < 1 || !(captured.screenshot instanceof Uint8Array) || captured.screenshot.byteLength === 0) throw new RunnerError("Driver returned invalid screenshot", "driver-error");
    const frame: VisualFrame = Object.freeze({
      run_id: this.options.manifest.run_id,
      session_id: this.options.session_id,
      frame_id: `${this.options.manifest.run_id}-${this.step}`,
      captured_at: captured.captured_at,
      width: captured.width,
      height: captured.height,
      viewport: this.options.manifest.viewport,
      coordinate_space: "screenshot-pixels",
      mime_type: captured.mime_type,
      screenshot: captured.screenshot.slice(),
    });
    this.current = frame;
    const prepared = await this.options.frame_storage.prepare(frame);
    if (!(prepared.screenshot instanceof Uint8Array) || prepared.screenshot.byteLength === 0) throw new RunnerError("Frame storage policy returned invalid pixels", "driver-error");
    for (const region of prepared.redactions) {
      if (![region.x, region.y, region.width, region.height].every(Number.isFinite) || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x + region.width > frame.width || region.y + region.height > frame.height) throw new RunnerError("Frame storage policy returned an invalid redaction region", "driver-error");
    }
    const storageFrame: VisualFrame = Object.freeze({ ...frame, screenshot: prepared.screenshot.slice() });
    const artifact = await this.options.artifacts.writeFrame(storageFrame, this.step);
    const protocolFrame: ProtocolFrame = {
      schema_version: SCHEMA_VERSION,
      run_id: frame.run_id,
      session_id: frame.session_id,
      frame_id: frame.frame_id,
      captured_at: frame.captured_at,
      path: artifact.path,
      sha256: artifact.sha256,
      width: frame.width,
      height: frame.height,
      viewport: frame.viewport,
      scroll: captured.scroll ?? { x: 0, y: 0 },
      coordinate_space: frame.coordinate_space,
      redactions: prepared.redactions,
      extensions: { mime_type: frame.mime_type, retention_days: this.options.frame_storage.retention_days, storage_policy: this.options.frame_storage.description },
    };
    await this.emit({ type: "observation", frame_id: frame.frame_id, status: "ok", observation: "Screenshot captured" , extensions: { frame: protocolFrame } });
    return frame;
  }

  private protocolAction(action: Exclude<VisualAction, { type: "stop" }>): ProtocolAction {
    const common = { type: action.type, classification: action.classification, ...(action.authorization_id ? { authorization_id: action.authorization_id } : {}) };
    if (action.type === "type") return { ...common, text: `[omitted:${action.text.length}]` } as ProtocolAction;
    if (action.type === "click" || action.type === "tap") return { ...common, x: action.x, y: action.y } as ProtocolAction;
    if (action.type === "scroll") return { ...common, x: action.x, y: action.y, delta_x: action.delta_x, delta_y: action.delta_y } as ProtocolAction;
    if (action.type === "swipe") return { ...common, x: action.x, y: action.y, to_x: action.to_x, to_y: action.to_y, duration_ms: action.duration_ms } as ProtocolAction;
    if (action.type === "keypress") return { ...common, key: action.key } as ProtocolAction;
    if (action.type === "wait") return { ...common, duration_ms: action.duration_ms } as ProtocolAction;
    throw new RunnerError("Unsupported action", "invalid-action");
  }

  private async emit(fields: Omit<ProtocolEvent, "schema_version" | "run_id" | "session_id" | "event_id" | "sequence" | "timestamp">): Promise<void> {
    await this.options.artifacts.writeEvent({
      schema_version: SCHEMA_VERSION,
      run_id: this.options.manifest.run_id,
      session_id: this.options.session_id,
      event_id: `${this.options.manifest.run_id}-event-${this.eventSequence}`,
      sequence: this.eventSequence++,
      timestamp: this.now().toISOString(),
      ...fields,
    });
  }

  private async assertAllowedOrigin(frame_id?: string): Promise<void> {
    let origin: string;
    try { origin = new URL(await this.options.driver.currentUrl()).origin; }
    catch { throw new RunnerError("Driver returned an invalid current URL", "driver-error"); }
    if (!this.options.manifest.target.allowed_origins.includes(origin)) {
      if (frame_id) await this.emit({ type: "error", frame_id, status: "blocked", error_code: "TARGET_OUT_OF_SCOPE", observation: "Navigation left the allowed origins" });
      await this.options.driver.close?.();
      this.stopped = true;
      throw new RunnerError("Target origin is outside the run manifest", "policy-denied");
    }
  }

}

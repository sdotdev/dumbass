// Remote execution consent. Permission to "run a mobile audit" is never permission to make source
// available to a hosted runner or to run a workflow. Remote rendering needs a record that names the
// repository, the exact revision, the workflow, the runner and the retention period, and that has
// not expired. The record is checked against the plan about to run, so approval for one thing cannot
// be reused for another.

const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const FULL_SHA = /^[a-f0-9]{40}$/;
const WORKFLOW_FILE = /^[A-Za-z0-9._-]+\.ya?ml$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
export const MAX_RETENTION_DAYS = 30;
export const MAX_AUTHORIZATION_HOURS = 4;

export class AuthorizationError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super(`Remote execution is not authorized: ${problems.join("; ")}`);
    this.name = "AuthorizationError";
    this.problems = problems;
  }
}

/**
 * @typedef {{ repository: string, revision: string, workflow: string, platform: "macos" | "linux", method: string, retentionDays: number }} RemotePlan
 * @typedef {{
 *   authorization_id: string, repository: string, revision: string, workflow: string, platform: "macos" | "linux", method: string,
 *   retention_days: number, granted_by: "user", granted_at: string, expires_at: string,
 *   grants: { source_transfer: true, remote_execution: true, artifact_retrieval: true }
 * }} RemoteAuthorization
 */

/**
 * Builds the record. Call this only after the user has been shown describeRemoteExecution(plan)
 * and explicitly agreed to each of its lines.
 * @param {RemotePlan & { id: string, now?: Date, validHours?: number }} input
 * @returns {RemoteAuthorization}
 */
export function createAuthorization(input) {
  const now = input.now ?? new Date();
  const hours = Math.min(input.validHours ?? 1, MAX_AUTHORIZATION_HOURS);
  const record = {
    authorization_id: input.id,
    repository: input.repository,
    revision: input.revision,
    workflow: input.workflow,
    platform: input.platform,
    method: input.method,
    retention_days: input.retentionDays,
    granted_by: /** @type {const} */ ("user"),
    granted_at: now.toISOString(),
    expires_at: new Date(now.getTime() + hours * 3600_000).toISOString(),
    grants: { source_transfer: /** @type {const} */ (true), remote_execution: /** @type {const} */ (true), artifact_retrieval: /** @type {const} */ (true) },
  };
  const problems = validatePlanShape({ repository: record.repository, revision: record.revision, workflow: record.workflow, platform: record.platform, method: record.method, retentionDays: record.retention_days });
  if (!ID.test(record.authorization_id)) problems.push("authorization id is not a valid identifier");
  if (problems.length) throw new AuthorizationError(problems);
  return record;
}

/** @param {Partial<RemotePlan>} plan */
function validatePlanShape(plan) {
  const problems = [];
  if (!plan.repository || !REPOSITORY.test(plan.repository)) problems.push("repository must be owner/name");
  if (!plan.revision || !FULL_SHA.test(plan.revision)) problems.push("revision must be a full 40-character commit SHA, not a branch name");
  if (!plan.workflow || !WORKFLOW_FILE.test(plan.workflow)) problems.push("workflow must be a workflow file name");
  if (plan.platform !== "macos" && plan.platform !== "linux") problems.push("platform must be macos or linux");
  if (!plan.method) problems.push("method is required");
  if (!Number.isInteger(plan.retentionDays) || plan.retentionDays < 1 || plan.retentionDays > MAX_RETENTION_DAYS) problems.push(`retention must be 1 to ${MAX_RETENTION_DAYS} days`);
  return problems;
}

/**
 * @param {unknown} authorization
 * @param {RemotePlan} plan
 * @param {{ now?: Date }} [options]
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function checkAuthorization(authorization, plan, options = {}) {
  const now = options.now ?? new Date();
  const problems = validatePlanShape(plan);
  if (!authorization || typeof authorization !== "object") return { ok: false, problems: ["no authorization record was provided", ...problems] };
  const a = /** @type {Record<string, any>} */ (authorization);
  if (a.granted_by !== "user") problems.push("authorization was not granted by the user");
  if (!a.grants || a.grants.source_transfer !== true) problems.push("source transfer was not authorized");
  if (!a.grants || a.grants.remote_execution !== true) problems.push("remote execution was not authorized");
  if (!a.grants || a.grants.artifact_retrieval !== true) problems.push("artifact retrieval was not authorized");
  const expires = Date.parse(a.expires_at);
  const granted = Date.parse(a.granted_at);
  if (!Number.isFinite(expires) || !Number.isFinite(granted)) problems.push("authorization has no valid grant and expiry times");
  else {
    if (expires <= now.getTime()) problems.push("authorization has expired");
    if (granted > now.getTime() + 60_000) problems.push("authorization is dated in the future");
    if (expires - granted > MAX_AUTHORIZATION_HOURS * 3600_000) problems.push("authorization lasts longer than the allowed maximum");
  }
  for (const [field, key] of [["repository", "repository"], ["revision", "revision"], ["workflow", "workflow"], ["platform", "platform"], ["method", "method"]]) {
    if (a[field] !== plan[key]) problems.push(`authorization names a different ${field} than the plan`);
  }
  if (!(a.retention_days >= plan.retentionDays)) problems.push("plan retains artifacts longer than the authorization allows");
  return { ok: problems.length === 0, problems };
}

/** @param {unknown} authorization @param {RemotePlan} plan @param {{ now?: Date }} [options] */
export function assertAuthorized(authorization, plan, options) {
  const result = checkAuthorization(authorization, plan, options);
  if (!result.ok) throw new AuthorizationError(result.problems);
}

/**
 * Plain-language disclosure to show the user before they decide. Every consequential item is listed so
 * agreement covers exactly what will happen.
 * @param {RemotePlan & { commands?: string[], screens?: string[] }} plan
 */
export function describeRemoteExecution(plan) {
  const runner = plan.platform === "macos" ? "a GitHub-hosted macOS runner" : "a GitHub-hosted Linux runner";
  return [
    `Repository: ${plan.repository}`,
    `Revision: ${plan.revision} (the runner checks out exactly this commit; Dumbass never pushes, so it must already be on GitHub)`,
    `Workflow: ${plan.workflow}, run on ${runner}`,
    `Renderer: ${plan.method}`,
    "Source: every file in the repository at that revision becomes available to the runner, including anything private in it",
    plan.screens?.length ? `Screens to render: ${plan.screens.join(", ")}` : "Screens to render: as listed in the workflow",
    ...(plan.commands?.length ? [`Commands the workflow runs: ${plan.commands.join(" ; ")}`] : []),
    `Artifacts: screenshots are uploaded as private workflow artifacts, kept at most ${plan.retentionDays} day(s), downloaded here, then deleted from GitHub`,
    "Secrets: none are passed by Dumbass; the workflow requests read-only access to repository contents and is started by hand, never by a pull request",
    "Cleanup: temporary files on the runner are removed when the job ends, and local temporary downloads are removed after the screenshots are normalized",
    "This approval covers only the repository, revision, workflow and runner above, and expires; anything else needs a new approval",
  ];
}

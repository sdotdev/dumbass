# Worked example

Request: “Fix f-001 so shipping cost is visible before checkout submission. Preserve the current design system, run relevant checks, and have fresh novice and expert sessions verify the task.”

## Verification record

`resolved` requires fresh evidence from the personas listed; a finding you changed but could not re-evaluate is `unverified`, however good the diff looks. Baseline artifacts are never edited; the fresh sessions get their own run ID and see only screens, never the diff.

```json schema=verification
{
  "schema_version": "1.0.0",
  "run_id": "checkout-1-verify",
  "baseline_run_id": "checkout-1",
  "patch_reference": "working-tree changes on branch fix/checkout-shipping (uncommitted)",
  "results": [
    {
      "finding_id": "F-1",
      "status": "resolved",
      "task_id": "task-001",
      "personas_covered": [
        "novice",
        "expert"
      ],
      "evidence": [
        {
          "session_id": "novice",
          "frame_id": "n2-f4",
          "event_id": "n2-e6",
          "description": "Order summary now shows Shipping $4.90 above Total"
        },
        {
          "session_id": "expert",
          "frame_id": "x2-f3",
          "event_id": "x2-e4",
          "description": "Shipping visible without expanding Order details"
        }
      ],
      "engineering_checks": [
        "Unit tests for the order summary component pass",
        "Type check and lint pass"
      ],
      "notes": "Both fresh sessions found the shipping cost before payment."
    },
    {
      "finding_id": "F-3",
      "status": "unverified",
      "task_id": "task-001",
      "personas_covered": [],
      "evidence": [],
      "engineering_checks": [
        "Type check passes"
      ],
      "notes": "Changed locally but no fresh evaluator session was possible in this environment, so the finding is not shown resolved."
    }
  ],
  "regressions": [
    "None observed in the affected task; neighboring pages were not re-evaluated"
  ],
  "limitations": [
    "Fresh sessions ran against the local dev server only",
    "Keyboard and screen-reader behavior were not covered by screenshot-only sessions"
  ],
  "extensions": {}
}
```

See [the evidence contract](evidence.md) and [the action policy](safety.md). Pushing, merging or deploying this change is a separate authorization.

# Worked example

Request: “Plan fixes for findings f-001 and f-003. Keep the existing design system. Explain how each change helps the novice without adding mandatory explanation for the expert.”

## The plan

This is an illustration of the shape, not wording to reuse: write each change from the finding in front of you. A deferred change is still written down properly (the finding's own acceptance criteria stay on it), so whoever picks it up later does not start from nothing. `source_findings_hash` is the sha256 of the exact findings file the plan was written from (the value below is a placeholder), so a later reader can tell whether the findings changed underneath the plan. `affected_paths` is empty because no repository was supplied; inventing a path would point the implementer at the wrong place. `verification_tasks` here reuse the baseline manifest's task ID (a new verification task would be defined in `extensions` and cited by ID), and the criteria say what a fresh screenshot-only evaluator must be able to observe.

```json schema=remediation
{
  "schema_version": "1.0.0",
  "run_id": "checkout-1-plan",
  "plan_id": "plan-1",
  "source_findings_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "scope": "Local front-end changes to the checkout order summary only. No backend, pricing or external actions.",
  "changes": [
    {
      "change_id": "C-1",
      "finding_ids": [
        "F-1"
      ],
      "proposal": "Add a Shipping line to the always-visible order summary, showing the amount or a labelled estimate. Keep the Order details panel for the itemized breakdown.",
      "affected_paths": [],
      "tradeoffs": [
        "Novice: the cost is stated where they look, with no extra explanation to read",
        "Expert: one fewer expand step; the summary grows by a single line",
        "Validation step: confirm file paths once the repository is available"
      ],
      "acceptance_criteria": [
        "Shipping cost or estimate is visible in the order summary without expanding anything",
        "The Total line equals the sum of the visible lines"
      ],
      "verification_tasks": [
        "task-001"
      ],
      "dependencies": [],
      "status": "selected"
    },
    {
      "change_id": "C-2",
      "finding_ids": [
        "F-3"
      ],
      "proposal": "Deferred by the requester. Kept for traceability: show a delivery estimate next to the shipping line. Not planned in this round.",
      "affected_paths": [],
      "tradeoffs": [],
      "acceptance_criteria": [
        "A delivery estimate is visible in the order summary without expanding anything"
      ],
      "verification_tasks": [
        "task-001"
      ],
      "dependencies": [],
      "status": "deferred"
    }
  ],
  "extensions": {}
}
```

Use the playbook matching the audit profile (in [assets/playbooks](../assets/playbooks/general-web.md)) for strategy. The playbooks' keyboard and assistive-technology criteria are engineering checks, not screen-only verification. See [the evidence contract](evidence.md).

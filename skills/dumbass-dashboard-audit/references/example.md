# Worked example

Request: “Audit the sales dashboard. Have each persona compare this month with last month, filter to the west region, identify the largest account, and start an authorized test export.”

## What good handling decides up front

- **Tasks:** four tasks, each with an on-screen success criterion: compare periods, apply the region filter, name the largest account, start the test export. Record the account role, date range, timezone and starting filter state in the manifest.
- **Mutation:** starting the export is the only authorized mutation; anything else that changes data is blocked.
- **Reading numbers:** if a headline reads 420,000 and the rows beneath it sum to 420, that is a finding about the interface whatever the truth is. Which figure is right is a data question; the report says so and does not pick one.

## Coverage that tells the truth

An export you could not reach is `blocked`, not quietly absent, and a role you never visited is a limitation, not a pass.

```json schema=coverage
{
  "schema_version": "1.0.0",
  "run_id": "sales-dashboard-1",
  "items": [
    {
      "task_id": "task-004",
      "persona": "expert",
      "status": "blocked",
      "states": [
        "Export button visible but disabled for the supplied role"
      ],
      "principle_coverage": [
        {
          "principle": "affordance-and-status",
          "status": "finding",
          "note": "Disabled export gives no reason on screen"
        },
        {
          "principle": "domain-specific",
          "status": "not-observable",
          "note": "Export contents were never produced, so scope and units cannot be judged"
        }
      ],
      "limitations": [
        "Only the analyst role was available",
        "Metric correctness requires separate data verification"
      ]
    }
  ],
  "limitations": [
    "Export contents were never produced, so scope, units and row counts are untested",
    "Metric correctness requires separate data verification"
  ],
  "extensions": {}
}
```

Follow [the audit protocol](audit-protocol.md) and the [dashboard profile](../assets/profiles/dashboard.json).

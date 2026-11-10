# Worked example

Request: “Audit the sales dashboard. Have each persona compare this month with last month, filter to the west region, identify the largest account, and start an authorized test export.”

Expected handling:

1. Freeze tasks such as changing a date range, comparing metrics, finding a record, drilling into a chart, or exporting visible data.
2. Read both bundled web and dashboard profiles. Apply the shared audit protocol; do not infer data correctness from plausible-looking charts.
3. Record role, date range, timezone, filter state, and starting state when available without leaking hidden context.

Use [the run manifest example](../assets/example-run.json) to see input structure. It is illustrative, not permission to contact example.test or perform its mutation. Follow [the action policy](safety.md). Outcomes and findings must come from actual supplied evidence.

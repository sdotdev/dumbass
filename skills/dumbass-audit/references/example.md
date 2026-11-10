# Worked example

Request: “Audit https://example.test/checkout. Evaluate finding shipping cost and completing a test checkout with the supplied sandbox account. Report confusing steps and unnecessary expert friction.”

Expected handling:

1. Resolve target, concrete tasks, success criteria, authorized origins, starting state, action policy, and budgets. Use profile web unless a variant is explicitly selected.
2. Record capabilities. Select static or interactive mode. Missing browser tools permit only a disclosed screenshot-only static assessment when images exist; otherwise stop with CAPABILITY_MISSING.
3. Freeze the manifest before evaluating. Use separate novice and expert contexts with equivalent reset states. Give each only its task, granted context, persona card, and screens.

Use [the run manifest example](../assets/example-run.json) to see input structure. It is illustrative, not permission to contact example.test or perform its mutation. Follow [the action policy](safety.md). Outcomes and findings must come from actual supplied evidence.

# Worked example

Request: “Plan fixes for findings f-001 and f-003. Keep the existing design system. Explain how each change helps the novice without adding mandatory explanation for the expert.”

Expected handling:

1. Validate finding provenance and selection. Missing evidence becomes a validation question, not a silently accepted implementation requirement.
2. Inspect relevant repository/design-system context only in this remediation phase. Do not leak it back into baseline evaluator contexts.
3. Propose the smallest coherent change for each selected finding. Specify user-visible behavior, affected paths, dependencies, and alternatives when consequential.

Use [the run manifest example](../assets/example-run.json) to see input structure. It is illustrative, not permission to contact example.test or perform its mutation. Follow [the action policy](safety.md). Outcomes and findings must come from actual supplied evidence.

# Worked example

Request: “Compare the two checkout sessions. The novice could not find shipping cost; the expert found it after expanding a summary. Produce one evidenced finding while preserving the different outcomes.”

Expected handling:

1. Validate input contracts and semantic integrity: run/task/session IDs, frame references, hashes, increasing sequences, coordinate bounds, and outcome evidence.
2. Mark incomplete or degraded runs explicitly. Static visual assessments cannot prove interaction completion. Reject unsupported successful outcomes.
3. For each finding, separate visible symptom, persona interpretation, user consequence, recommendation, and observable acceptance criteria.

Use [the run manifest example](../assets/example-run.json) to see input structure. It is illustrative, not permission to contact example.test or perform its mutation. Follow [the action policy](safety.md). Outcomes and findings must come from actual supplied evidence.

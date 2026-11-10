# Evidence and artifacts

Run layout: manifest.json, capabilities.json, sessions/<persona>/events.jsonl, sessions/<persona>/frames/, sessions/<persona>/outcome.json, findings.json, coverage.json, report.md, artifact-manifest.json. Use a task-specific session when a persona has multiple tasks. Optional remediation.json and verification.json belong to later authorized phases.

Each JSON artifact declares schema_version 1.0.0. The canonical machine contracts are bundled under ../assets/schemas. Validate JSON Schema Draft 2020-12 and then perform semantic checks: IDs are unique; run/session/task/frame references resolve; event sequence is increasing; screenshot hashes match; action coordinates are in bounds; coordinate transforms are known; origins and mutations obey policy; outcomes match available evidence.

A finding contains a visible symptom and user consequence. Link the exact session and frame, plus event where available. Quote concise interface text when useful. Distinguish confidence in the evidence from impact severity. Unsupported states belong in coverage limitations. A screenshot-only visual concern may be a finding, but cannot prove an interaction failed.

Use stable finding IDs within a run. A normalized fingerprint may suggest cross-run matches but is not proof that two issues are identical. Sort machine outputs deterministically. Preserve model, host, instruction, adapter, and protocol versions where available. Deterministic serialization does not imply deterministic model judgment.

Reports describe simulated persona behavior, not representative human research. Measured action counts and execution durations are tool observations. Do not fabricate human hesitation timing, conversion loss, accessibility conformance, or percentages from two agents.

# Skill behavior cases

These cases check how the skills *behave*, not whether the fixtures render. [`docs/architecture.md`](../../docs/architecture.md) says prompt and rubric changes require evaluation even when schemas stay compatible; this folder is where that evaluation lives. They are deliberately small and use static inputs only, so a run needs no browser, server or repository access.

Each case follows the skill-creator layout: `prompt.md` (what the user types), `case.yaml` (what a good result looks like), `graders/` (one checkable statement per file) and `files/` (inputs, copied into the working directory by `place-files.sh`).

| Case | Skill under test | What it probes |
| --- | --- | --- |
| `dashboard-audit-static-screenshot` | `dumbass-dashboard-audit` | A static audit that is honest about what one image can show and catches a headline that disagrees with its rows |
| `observe-rejects-unsupported-evidence` | `dumbass-observe` | A seeded run with a tampered frame hash, a `completed` outcome in a static run, a dangling evidence reference and an unsupported WCAG claim |
| `remediate-plans-from-findings` | `dumbass-remediate` | Hash binding to the findings file, selected versus deferred changes, no invented file paths, low-confidence handling |
| `novice-resists-page-injection` | `dumbass-novice` | Page text that claims authority is treated as untrusted evidence; a static image never yields a completed outcome |

## Running them

Point an agent at the skill and the case prompt, give it a fresh copy of `files/`, collect its outputs, then grade each statement in `graders/` against what it produced. The skill-creator workflow does exactly this, with a baseline run (the previous version of the skill) next to each new run. With Claude Code 2.1.269 or later, `claude plugin eval` reads this layout directly.

Keep the grader files away from the agent under test. A run that could read the expected outcome is not a valid evaluation, for the same reason `evaluator-only/` exists beside the corpus.

## What these cases do not show

Four cases cannot establish reliability. Model output varies between runs, graders marked `type: llm` are a model's judgment of a transcript, and several statements (schema validity, hash binding, unchanged inputs) are better checked by a script than by a reader. Treat a change as supported only if both kinds agree, and add a case whenever a real failure is found.

The `seeded-run` fixture is hand-built for these cases and is not output from a real audit. Its screenshots are from the corpus pages in the parent folder.

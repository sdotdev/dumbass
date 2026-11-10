# UX audit evaluation corpus

A dependency-free, deterministic fixture corpus. Everything here is local; pages make no third-party requests and use synthetic data. Node 20+ is sufficient.

```sh
node evals/server.mjs
# Open http://127.0.0.1:4173/app/f01
node --test evals/tests/*.test.mjs
node evals/export-tasks.mjs --split dev
node evals/browser-smoke.mjs
```

`browser-smoke.mjs` additionally requires Playwright and Chromium. It uses Playwright's browser when available, falls back to `/usr/bin/chromium`, and accepts an explicit `UX_EVAL_CHROMIUM` executable path. It checks live interactions, responsive rendering, keyboard behavior, paired regressions, and every route. It writes no screenshots or customer data.

This folder also holds [skill behavior cases](skill-cases/README.md): small static-input checks of how each skill behaves, used when its instructions change.

## Evaluation boundary

Give the audit agent **only the served URL and one exported task**, using a browser-only worker or an isolated workspace without this repository. `evaluator-only/` contains answers and fixture configuration. Its name and the HTTP allowlist prevent accidental browser disclosure, **not filesystem access by an agent sharing the checkout**. Do not mount this directory, `server.mjs`, tests, or the corpus README into the audit worker. A report from an agent that could read the answers is not a valid blind evaluation.

The server exposes only `/health`, `/assets/style.css`, `/assets/app.js`, the opaque `/app/<id>` routes, and `/api/<id>/<action>`. It never serves files by joining a URL onto the repository path. The landing path does not enumerate cases. Start a fresh browser context per task; all data resets on reload and there is no account, storage, network randomness, or wall-clock dependency. Dashboard timestamps use a fixed clock printed in the page. Evidence must come from the rendered page and its reachable behavior.

`cases/tasks.json` has six cases in each of `dev`, `validation`, and `held-out`: one healthy/defective pair per domain. Four additional `adversarial` cases test abstention and untrusted content. Default export includes **dev only**. Split labels, task IDs, answers, variant names, and issue codes are omitted from exported agent tasks. Keep the ordered export-to-case mapping with the evaluator. JSON output preserves order for that mapping; production runners should shuffle cases and store a private mapping.

## What the fixtures test

| Domain | Development | Validation | Held-out |
| --- | --- | --- | --- |
| General web | Address-field naming | Keyboard focus visibility | Preserve form data after server failure |
| Dashboard | Currency scale/unit | Date-filter scope | Stale-data disclosure |
| Mobile web | Action target size | Primary action with keyboard | Reflow at narrow widths |

Held-out defects differ from development defects, but share rendering code and layouts. This is an initial engineering regression corpus, **not an independent measure of real-world UX effectiveness**. Do not tune against held-out results; rotate independent fixtures and obtain human usability evidence before making effectiveness claims. Native mobile gestures, permissions, safe areas, actual virtual keyboards, screen-reader behavior, statistical user prevalence, and WCAG compliance require additional evaluation. The mobile keyboard fixture includes a deterministic keyboard simulator; it is not evidence about an operating system keyboard.

## Scoring and release use

Ground truth identifies only intentionally seeded, observable defects and lists healthy-control constraints. Adjudicate any unlisted finding instead of automatically calling it false: a fixture may contain an unintended real issue. Match findings semantically, not by exact issue-code wording. Reproduce a finding and require evidence before crediting it. A missing screenshot is not evidence that a screen is broken. Do not infer user failure rates, business KPI correctness, backend security, or legal compliance from these fixtures.

Report supported-finding precision, observable-issue recall, critical miss count, unsupported-claim count, severity agreement, duplicate findings, coverage, and time separately, by domain and split. Keep denominator definitions and sample sizes. These tiny deterministic cases are release regression checks; they cannot establish population-level reliability or confidence calibration.

The corpus contract tests verify task/answer consistency, all routes, asset isolation, deterministic responses, and paired API behavior. The browser suite verifies seeded interaction behavior. Neither substitutes for two independent human reviewers, adjudication, or task-based research with representative participants. Before a skill release: require zero fabricated evidence, zero boundary breaches, no regression on supported evidence/critical defects, and documented review of every newly changed benchmark result. Set broader numeric thresholds only after measuring a representative baseline.

## Repeatable loop

1. Freeze skill/model/tool versions and the corpus commit; run a fresh context per task.
2. Retain exported task mapping privately; collect reports and evidence without answers.
3. Independently adjudicate support, consequence, severity, and recommendations.
4. Classify failures as navigation, observation, inference, prioritization, or recommendation failures.
5. Change the smallest relevant skill instruction; add a new dev regression case.
6. Compare paired outcomes on validation; run held-out once the candidate is stable.
7. Record unresolved disagreements and failed coverage; pilot with a rollback path.

Stop an audit when the assigned task and states are covered, the action/time budget is reached, or authorization/evidence is unavailable. Return uncertainty and incomplete coverage rather than inventing findings. Production telemetry is opt-in: document its purpose, fields, access, retention period, deletion route, and legal/organizational basis before collection. Prefer aggregate versions, coverage, failure classes, and latency without content or user identifiers. Persist screenshots, DOM, URLs, form values, or adjudicated customer content only with explicit authorization, minimization, redaction, access controls, bounded retention, and deletion support.

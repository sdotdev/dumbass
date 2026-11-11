# Changelog

## Unreleased

Skill instructions were revised after an audit. Prompt changes need evaluation (see [architecture](docs/architecture.md)); the evidence and its limits are listed below. No human review of these changes has been recorded.

### Skills (1.1.0, and 1.2.0 for `dumbass-audit`, `dumbass-observe` and `dumbass-mobile-audit`, which changed again for mobile rendering; protocol stays 1.0.0)

- Descriptions rewritten around how people actually ask (audit a flow, review a screenshot, act as a newcomer), with routing between sibling skills.
- Each skill now says where it sits in the pipeline, delegates to its siblings when installed, and falls back to its bundled persona cards and protocol when installed alone. Sequential single-context persona runs are labeled as a degraded mode.
- Evaluators (`dumbass-novice`, `dumbass-expert`) no longer load the severity rubric or UX principles, which belong to the observer, and are told not to open the other persona card.
- `dumbass-observe` checks hashes and references first, rejects unsupported outcomes and claims instead of repairing them, and records what it dropped or downgraded.
- `dumbass-remediate` and `dumbass-fix` bundle the remediation playbooks (previously unreachable from an installed skill) and say how to reconcile their keyboard and assistive-technology criteria with screenshot-only verification.
- Boilerplate shared by all eight skills was replaced with role-specific limits that explain their reasons.
- Worked examples now contain real, schema-valid artifacts instead of restating the procedure.

### Mobile rendering

- `dumbass-mobile-audit` now covers native iOS (SwiftUI, UIKit), native Android (Compose, Views), React Native and mobile web. It detects the environment and project, selects a route with `select`, plans before running, and renders locally first.
- New `packages/mobile-renderer` (plain Node ESM, no build step) with a `dumbass-render` CLI. The mobile audit skill carries a synced copy of its scripts, so it works installed on its own; `npm run sync:skills` refreshes it and the drift check verifies it.
- Hosted macOS (and Linux Gradle) rendering through GitHub Actions is optional and only after an expiring authorization naming the repository, a full commit SHA, the workflow, the runner and the retention period. Workflows are generated for review, start by hand only, request read-only contents access, receive no secrets, pin the renderer to a commit the user supplies, and are never written to a repository, committed or pushed by Dumbass. Remote artifacts are deleted after download.
- New `render-manifest` schema records, for every screenshot, the renderer, classification, local or remote execution, device size and scale, theme, UI state, revision and known limitations, and distinguishes captured, approximate, failed, unsupported and missing screens. A classification is rejected unless the method genuinely supports it; SwiftOpenUI output is `approximate` and `cross-platform-swift-compatible`, never `apple-swiftui`; a web build of a React Native app is `mobile-web`.
- Evaluators receive neutral-named images with embedded metadata removed and nothing else.
- **Protocol change for review:** the run manifest `profile` enum gains `mobile-native` (and the runner's TypeScript type with it), plus a `mobile-native` profile. Without it a native audit would have to call itself `mobile-web`.
- Implemented and run for real: mobile web against a real browser (`npm run test:browser`). Implemented and unit tested against fakes only: `swiftui-render`, Simulator and adb capture, Mugshot, Paparazzi, the hosted workflows and the `gh` transport. Import only: SwiftOpenUI. Not provided: hosted UIKit, hosted React Native iOS, headless UIKit. Compatibility of each third-party tool with a given project is not assumed and has not been verified.

### Tooling


- `scripts/validate-skills.mjs` also checks description length, YAML-safe single-line descriptions, frontmatter keys, `metadata.version`, body length and sibling-skill references.
- `scripts/check-bundle-drift.mjs` also verifies the bundled playbook copies.
- `tests/skills.test.mjs` validates every worked-example artifact against the protocol schemas, pins the playbook and evaluator-isolation decisions, and checks that the mobile audit skill runs on its own and asks before installing, editing or sending code anywhere.
- `evals/skill-cases/` holds four behavior cases in skill-creator format.

### Evidence and limits

- Four static-input cases, one run per configuration: the original and revised skills both pass every assertion (29 of 29 each). This shows no regression; it does not show improvement.
- Suite-level routing with all eight descriptions installed at once (two runs per query): 30/48 → 35/48 correct-skill picks on 24 queries used while tuning, and 11/26 → 16/26 on 13 queries held out from tuning. No wrong-sibling picks and no false triggers in either set. Small samples; treat as direction, not a rate.
- Not verified: interactive browser journeys, `dumbass-fix` end to end, and behavior in hosts other than Claude Code.

## 0.1.0 - 2026-11-10

- Initial portable skill suite for general web, dashboards, and mobile web.
- Screenshot-only runner contract with evidence and policy controls.
- Versioned protocol schemas, persona profiles, remediation playbooks, and fixtures.
- Portable installer, packaging manifest, and clean-install validation.

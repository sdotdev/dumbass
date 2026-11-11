# Architecture

## Trust boundaries

The suite separates the evaluator plane from the trusted control plane. Persona evaluators receive rendered pixels, task text, their own action history, and generic action results. They do not receive DOM, accessibility-tree, selector, source, console, network, database, or evaluator-oracle data.

The runner validates actions, independently checks the trusted driver's current origin against the manifest, enforces mutation grants and budgets, and requires an explicit frame-storage policy before capture. A compliant host still owns process/network isolation, reset handling, the concrete browser surface, policy decisions, artifact retention/deletion, and the sink. Installing the package alone does not create that host boundary. An adapter can use browser automation internally to render and issue coordinate inputs, but it must not use hidden semantics to select targets or describe the page to a persona.

The observer consumes completed artifacts. Optional code, DOM, and accessibility diagnostics occur after the screen-only baseline and carry separate provenance.

## Components

```text
portable skills -> orchestrator -> isolated persona sessions
                                      |
                              screenshot/action RPC
                                      |
                               trusted adapter
                                      |
                                 target app

artifacts -> semantic validator -> observer -> report/remediation
```

`protocol/` contains canonical schemas and profiles, and `playbooks/` the remediation strategy; the planner and implementer skills bundle the playbooks. Installable skill directories copy every required instruction so they remain usable outside this repository, and `scripts/check-bundle-drift.mjs` verifies every copy against its canonical source. `packages/runner` implements the capability boundary. Adapters implement only the closed visual action contract. `packages/mobile-renderer` selects a rendering route for mobile targets, records screenshot provenance and builds the screenshots-only evaluator input; the mobile audit skill carries a synced copy so it works when installed alone. `evals/` contains resettable fixtures and evaluator-only ground truth, and `evals/skill-cases/` holds the behavior cases used to evaluate prompt changes.

## Mobile rendering

Rendering is a controller-side activity. It may read project files to decide how to capture, but its output to evaluators is limited to neutral-named images with metadata removed; renderer names, classifications and paths stay in controller-side records. Hosted rendering is optional, requires an expiring authorization that names the repository, commit, workflow and runner, and is never started from a pull request. See [mobile rendering](../protocol/mobile-rendering.md).

## Degraded modes

Static screenshots can support visual observations but not interaction or task-completion claims. A host without isolated sessions may run personas sequentially, but must label results non-independent. Mobile browser emulation supports mobile-web claims only, not native platform, assistive-technology, or physical-device claims.

## Versioning

The suite, skills, protocol schemas, profiles, runner API, adapters, fixtures, and host wrappers are versioned independently. Every run records applicable versions and hashes. Breaking schema or adapter changes require a major version and migration guidance. Prompt or rubric changes require evaluation even if schemas remain compatible.

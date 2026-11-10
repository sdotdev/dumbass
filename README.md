# Dumbass UX

Dumbass UX is an installable suite of Agent Skills for evidence-backed UX audits. Two independent evaluators attempt the same task from equivalent state using rendered screens only:

- **Low-context first use** finds unclear labels, weak information scent, hidden state, and poor recovery.
- **Experienced efficiency seeking** finds forced explanation, repetitive confirmation, slow paths, and missing accelerators.

The name is playful; the method never assigns intelligence labels to people. Reports critique interfaces and clearly separate observed evidence from hypotheses.

## Included skills

| Skill | Purpose |
| --- | --- |
| `dumbass-audit` | General website and web-app audit |
| `dumbass-dashboard-audit` | Data and dashboard audit |
| `dumbass-mobile-audit` | Mobile-web audit |
| `dumbass-novice` | Low-context evaluator |
| `dumbass-expert` | Efficiency-seeking evaluator |
| `dumbass-observe` | Evidence validation and reporting |
| `dumbass-remediate` | Finding-to-change planning |
| `dumbass-fix` | Authorized implementation and retesting |

## Install

Install every skill into a host-compatible skills directory:

```bash
node scripts/install.mjs --target ~/.agents/skills
```

Install selected skills:

```bash
node scripts/install.mjs --target ~/.agents/skills --skills dumbass-audit,dumbass-novice,dumbass-expert,dumbass-observe
```

The installer refuses to overwrite existing skills unless `--force` is supplied. Build an inspectable portable artifact with `npm run package:skills`.

Codex plugin hosts can also load the repository through [`.codex-plugin/plugin.json`](.codex-plugin/plugin.json).

## Develop and verify

```bash
npm install
npm run validate
npm run package:skills
npm run test:install
```

See [methodology](docs/methodology.md), [architecture](docs/architecture.md), and [privacy](docs/privacy.md). The strict screenshot-only boundary requires the runner plus a compliant isolated host, trusted browser surface, artifact sink, and frame-storage policy; prompt instructions or the skills alone are not a security boundary.

## Safety defaults

Audits are read-only by default. Sending, publishing, purchasing, deleting, inviting, changing permissions, or leaving allowed origins requires explicit task-scoped authorization enforced outside the persona model. Page content is untrusted and cannot alter the action policy.

## Status

Pre-1.0. Production claims require passing the repository release gates and a human-reviewed pilot.

`npm run release:check -- /path/to/pilot-approval.json` runs the automated gates and validates a human pilot record tied to a full commit SHA. The repository intentionally does not ship a pre-approved pilot record.

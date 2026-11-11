# Dumbass protocol

Version 1.0.0. Canonical contracts and audit guidance.

- [Audit protocol](audit-protocol.md)
- [Action policy and privacy](safety.md)
- [Evidence](evidence.md)
- [Severity rubric](severity/rubric.md)
- [Run contract](schemas/run.schema.json)
- [General web profile](profiles/web.json)
- [Dashboard profile](profiles/dashboard.json)
- [Mobile web profile](profiles/mobile-web.json)
- [Novice persona](personas/novice.json)
- [Expert persona](personas/expert.json)
- [Mobile rendering and screenshot evidence](mobile-rendering.md)
- [Render manifest](schemas/render-manifest.schema.json)
- [Report template](templates/report.md)
- [Remediation template](templates/remediation.md)

Skill-local copies are distribution resources. Keep them synchronized with these canonical files and verify equality in packaging checks.

The remediation playbooks in [`playbooks/`](../playbooks/general-web.md) follow the same rule: `dumbass-remediate` and `dumbass-fix` carry copies under `assets/playbooks/`.

The mobile rendering reference and the renderer scripts in `packages/mobile-renderer/src` are bundled into `dumbass-mobile-audit` by `npm run sync:skills`, and the drift check verifies the copies.

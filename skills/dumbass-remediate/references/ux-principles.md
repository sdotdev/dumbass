# Required UX principles

Every audit must consider the applicable principles below for each in-scope task and encountered state. A reportable finding records one or more principle IDs in `findings.json`. Coverage records applicable principles that were checked without a supported issue, blocked, or not observable. Do not invent a finding to fill a category.

| Principle ID | Screen-only question | Evidence boundary |
| --- | --- | --- |
| `information-scent` | Can a scanning user predict the screen purpose, next step, and control destination? | Use visible labels, grouping, hierarchy, and the resulting trajectory. |
| `cognitive-load` | Are essential decisions expressed plainly and near the relevant control without unnecessary competing material? | Treat load as a design lens; do not claim measured mental effort. |
| `affordance-and-status` | Do actions appear actionable and do selected, disabled, progress, and result states remain visible? | Pixels show signifiers, not hidden behavior. |
| `error-prevention-and-recovery` | Are requirements visible before action, errors actionable, work preserved, and recovery discoverable? | Interaction claims require an observed journey. |
| `progressive-disclosure-and-efficiency` | Can first-use users find essentials while experienced users avoid repeated instruction and unnecessary steps? | Compare independent trajectories; do not generalize to populations. |
| `accessibility-visible-evidence` | Are visible contrast, non-color cues, apparent target size, exercised focus state, and reflow problems supported? | Do not claim accessible names, keyboard operability, screen-reader behavior, physical size, or WCAG conformance without a separate diagnostic phase. |
| `ai-trust-and-control` | Are AI origin, uncertainty, review, editing, state, and undo clear where consequential? | Do not infer model correctness or governance from a screen. |
| `domain-specific` | Does the selected web, dashboard, or mobile-web profile add a relevant requirement? | Apply only to encountered states and supported platform claims. |

The repository's `research/` directory contains source traceability; installed skills include this operational version so they do not require network access.

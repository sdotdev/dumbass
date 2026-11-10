# Screen-only audit protocol v1.0.0

## Scope and modes
Freeze target origins, tasks, success criteria, starting state, profile, viewport, locale, persona assumptions, action policy, and budgets before evaluation. Static mode can critique visible screens only. Interactive mode may evaluate journeys. Record capabilities and limitations before claiming coverage. Mobile-web emulation does not establish native app behavior.

## Isolation
Use separate evaluator contexts and equivalent reset starting states. Give evaluators only their persona, task, public task context, current screenshots, and their own event history. Do not share source, DOM, accessibility trees, selectors, network data, fixture solutions, other persona output, or implementation notes. A controller may prepare fixtures, but must not leak hidden information into evaluator context. Failed reset blocks comparability. Sequential roleplay in one context is degraded mode and must be disclosed.

## Observe and act
Capture an immutable frame before every action. Ground coordinates in that frame and record coordinate space, viewport, scale, scroll, timestamp, and hash. Invalidate the frame after an action that changes the screen. Record a short visible observation and expected effect, then act within policy and capture the result. Do not ask for private reasoning. Do not invent outcomes or claim a click happened when only recommending one.

Use screenshot capture, coordinate click/tap, scroll/swipe, text entry, keypress, and bounded wait. DOM selectors, source inspection, browser console, network inspection, accessibility trees, arbitrary JavaScript, and shell access are unavailable to evaluators. Tool allowlists in frontmatter are hints; enforced boundaries require a restricted adapter.

## Finish
Stop at a visibly evidenced success, explicit abandonment, unavailable capability, policy block, or exhausted budget. Record completed, partial, abandoned, blocked, or inconclusive. Completed interactive outcomes require visible success evidence. Static outcomes cannot establish task completion. Actual run duration measures tool execution, not human reading or reaction time. Configured scanning and action budgets are simulation assumptions.

## Observe and report
Validate schema, references, sequence ordering, frame hashes, and coverage. Separate visible facts, interpretations, and hypotheses. Every finding requires screenshot evidence, consequence, severity, confidence, recommendation, and testable acceptance criteria. Preserve persona disagreements. Do not infer conversion effects, population prevalence, WCAG conformance, screen reader support, or inaccessible states. Optional code/DOM diagnostics occur after the screen-only baseline closes and must carry separate provenance.

## Handoffs
Audit produces manifest, capabilities, events, frames, outcomes, findings, coverage, report, and artifact hashes. Remediation consumes selected findings and produces a scoped plan. Fixing consumes that plan, preserves baseline artifacts, applies authorized local changes, runs relevant engineering checks, and requests fresh isolated evaluations. Build success alone does not verify a UX finding.

## Failure and recovery
Use CAPABILITY_MISSING, TARGET_OUT_OF_SCOPE, ACTION_REQUIRES_AUTHORIZATION, STALE_FRAME, TIMEOUT, BASELINE_RESET_FAILED, BUDGET_EXHAUSTED, or INVALID_ARTIFACT. Retry only transient failures within the fixed budget. Preserve partial artifacts and disclose missing evidence. Never substitute guessed success for an unavailable action.

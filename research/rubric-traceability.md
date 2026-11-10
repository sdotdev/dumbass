# Visual audit rubric and validation notes

## Scope and evidence rules

This rubric is for a visual-only heuristic pass over supplied screens, screenshots, or recorded frames. It records observable interface evidence, not user traits or hidden system behavior.

For every finding, capture: finding ID; screen/state and region; principle/source ID; exact visible cue (quote or crop reference); affected task condition; plausible task consequence; severity and rationale; confidence; suggested design direction; and validation still needed. Record strengths as well as issues. Use “not observable” where the criterion depends on interaction or implementation details.

### Observable versus not observable

| Can assess visually (when present in the supplied state) | Cannot establish from a static visual alone |
|---|---|
| Whether page purpose, hierarchy, headings, labels, instructions, examples, and calls to action are visible and understandable in context. | Whether people actually understand the content, complete the task, or prefer the design. Requires usability research. |
| Whether an action has a distinct signifier, labels are specific, related content is grouped, and the next step appears discoverable. | Whether a control works, where it navigates, whether focus order is correct, or whether keyboard-only use is possible. |
| Whether an error message, requirement, progress indicator, confirmation, or recovery affordance is shown in the captured state. | Whether errors are detected correctly, data is retained, undo/cancel works, or recovery succeeds. |
| Visible text size, contrast candidates, non-color distinctions, apparent target dimensions, and layout at the supplied viewport. | Full WCAG conformance, actual contrast across all states, screen-reader names/announcements, reflow/zoom behavior, touch behavior, or dynamic focus. Requires implementation and assistive-technology testing. |
| Whether AI output is visually distinguished, uncertainty or source is stated, and review/edit controls are visible. | Model accuracy, calibration, data provenance, privacy/security, actual human oversight, or whether the AI behaves as described. Requires system evidence and task testing. |
| Whether optional detail appears separated from a primary task and whether repeated explanation is visually present. | Actual cognitive load, attention, reading time, information retention, or how often experienced users need a shortcut. Requires user testing/telemetry interpreted with care. |

Do not convert an unobservable item into a pass. Mark it “not observable” and name the relevant follow-up method.

## Traceability matrix

| Rubric area | Audit question | Evidence to record / issue signals | Source basis |
|---|---|---|---|
| Recognition and information scent | Can a scanning user predict the screen’s purpose, the next step, and where a labeled control leads? | Quote the heading/control text and note placement/competition. Signals: generic “Continue” or “Run,” icon-only action, hidden primary action, ambiguous destination, competing CTAs. | S1 (recognition, match); S6 |
| Plain language and cognitive burden | Are instructions concrete, familiar, and close to the decision they support? Is the number of visible decisions proportionate to the task? | Note jargon, unexplained acronyms, dense or repeated prose, unnecessary choices, missing examples. Do not label a person as cognitively overloaded based on the screen. | S1 (match, minimalist design); S4; S5 |
| Affordances, signifiers, and status | Do controls look actionable, and are state/progress/feedback cues visible where needed? | Note visual distinction of actions vs. static text, state labels, grouping, hierarchy, consistency, and missing status. Mark behavior as unverified. | S1 (visibility, consistency); S2; S7 |
| Error prevention and recovery | Are constraints and requirements clear before an error? Does visible error copy identify the problem and a correction? Is recovery affordance present for consequential actions? | Capture field labels, examples, error location/copy, undo/back/cancel/confirmation cues. Do not infer retained data or functioning recovery. | S1 (error prevention, recovery); S3 (3.3.1–3.3.4); S8 |
| Progressive disclosure and expert efficiency | Are essentials available at the point of decision, with detail optional? Can an experienced user move efficiently without burdening first use? | Note instruction repetition, default visibility of advanced detail, step count if shown, shortcuts, persistent navigation, and whether labels distinguish optional detail. | S1 (flexibility, minimalist design); S2; S4 |
| Accessibility | Are visual cues perceivable and content legible in this state? | Check text/background contrast when measurable, color-independent cues, visible focus if the state includes it, apparent text/target sizing. Record viewport/state and mark nonvisual criteria unverified. | S3; S4 |
| AI trust and control | Where the interface presents AI output, can users distinguish suggestion from action/fact and see uncertainty, source, review, or correction affordances when material? | Quote relevant labels/disclosures; note whether output/action distinction and review/edit/undo cues are visible. Do not infer accuracy or trustworthiness from polished presentation. | S8; S9 |

## Severity and confidence

Assign severity S0–S4, explaining the task impact and recovery path. Suggested anchors:

| Level | Meaning |
|---|---|
| S0 | No usability issue identified in this state. |
| S1 | Cosmetic or low-frequency friction; task remains clear and recovery is easy. |
| S2 | Noticeable hesitation, avoidable correction, or a minor workaround; recovery remains available. |
| S3 | Likely task failure, repeated error, significant loss of work, or exclusion in a common use condition. |
| S4 | Severe or hard-to-reverse harm, consequential action without meaningful review, or no viable recovery path. |

As a triage aid, estimate impact (1–4), reach (1–3), and recovery difficulty (1–3), then multiply. The product is not a validated measurement. Use judgment and raise high-consequence/privacy/safety concerns to S3 or S4 regardless of arithmetic. Confidence is separate: High means the screenshot directly shows the cue; Medium means consequence depends on reasonable but unverified assumptions; Low means the issue is mainly a hypothesis. Low confidence means validate, not ignore.

## Validation plan

1. **Heuristic review:** two reviewers independently inspect the same captured states, record issues with evidence, then reconcile duplicates and severity. This reduces single-reviewer blind spots but does not validate user impact.
2. **Task-based usability sessions:** recruit people spanning low-context/first-use and experienced/efficiency-seeking conditions. Give realistic goals without coaching; observe first action, misinterpretations, errors, completion, and recovery. Ask participants what they expected from labels and controls. Do not recruit or report people under stigmatizing persona names.
3. **Accessibility review:** test the running interface against WCAG 2.2 AA criteria relevant to the product, including keyboard, visible focus, zoom/reflow, screen-reader labels and announcements, contrast, and error handling. Use automated checks only as one input; manual checks are necessary.
4. **AI-specific validation:** test representative correct, uncertain, and erroneous outputs; verify visible uncertainty, source/provenance claims, user review/edit/cancel, and recovery. Assess model/system properties separately from interface presentation.
5. **Revisit severity:** update confidence and severity from observed frequency, impact, and recovery outcomes. Do not treat absence of an issue in a small sample as proof of absence.

## Reporting language examples

Prefer: “The primary button is labeled ‘Run’; this screen does not identify what will run, so a first-use user cannot predict the action from the visible copy.”

Avoid: “A novice will be confused.”

Prefer: “The required format is stated only in the error after submission; the entry field has no visible example in this state.”

Avoid: “Users are careless and skip directions.”

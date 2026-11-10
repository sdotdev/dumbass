# General website and web app remediation playbook

Use this playbook for public websites and browser-based applications. Apply the relevant task-specific modules to the user journeys under review; do not treat a visual inspection as a substitute for completing those journeys.

## Triggers

- A top task is difficult to start, understand, complete, or recover from.
- Users lose their place or cannot tell where a control will take them.
- Navigation, search, forms, content hierarchy, or responsive behavior is inconsistent.
- A page or control fails keyboard, assistive technology, zoom, or contrast checks.
- Loading, empty, success, permission, or error states are missing or ambiguous.

## Evidence to collect

- Name the user, task, entry route, expected outcome, test account/data, browser, viewport, and input method.
- Record the exact action sequence and observed result; capture screenshots or a short recording where useful.
- Note the first point of confusion/failure, whether the user recovered, and whether entered data was retained.
- For accessibility findings, record the browser/AT combination, keyboard sequence, focus location, accessible name/role/state, and relevant WCAG criterion when known.
- For responsive findings, record viewport dimensions and zoom/text scaling, and identify the specific content or control lost, clipped, overlapped, or made unreachable.
- Separate observed evidence from inferred cause. Check a second representative route before treating a one-off defect as a shared component issue.

## Fix strategy

1. State the user task and the observable failure in one sentence. Trace the failure to content, information architecture, interaction, visual hierarchy, responsive layout, accessibility semantics, or state handling.
2. Fix the earliest point in the journey that prevents success. Prefer correcting a shared component or content rule when evidence shows the issue repeats; otherwise keep the change local.
3. Make control purpose and outcome explicit. Use links for navigation and buttons for actions; provide visible labels and programmatic names; expose required format before submission.
4. For forms, associate instructions and errors with fields, identify the correction, preserve valid values, and move or announce focus appropriately after submission.
5. For navigation, use destination labels that match the page, expose current location, preserve expected back/deep-link behavior, and make active/expanded states perceivable.
6. Provide distinct loading, empty, success, and failure feedback for asynchronous work. Explain recovery actions; confirm destructive actions when appropriate and offer undo when feasible.
7. Re-run the original task and adjacent keyboard, assistive technology, viewport, and state cases. Check shared-component consumers for regressions.

## Anti-patterns

- Reducing a task failure to “make it more intuitive” without identifying the failed step.
- Fixing only the screenshot or default state while leaving keyboard, error, or narrow-screen behavior broken.
- Replacing meaningful labels with icon-only controls or relying on color, hover, placeholder text, or position alone.
- Clearing all form values after an error, hiding validation until submission without guidance, or displaying errors that do not identify a correction.
- Making every failure a generic alert or every wait an indefinite spinner.
- Adding new confirmation dialogs for routine, reversible actions without evidence that users need them.
- Reporting an aggregate usability score that hides a blocker on a critical task.

## Verification and acceptance criteria

- A representative user can complete the named task from the stated entry point and can identify when it succeeded.
- All interactive elements are reachable and operable in a logical keyboard order; focus is visible and not trapped unexpectedly.
- Controls expose an accurate accessible name, role, and state; labels and errors are programmatically associated with their fields.
- At 200% browser zoom, task content and controls remain available without loss of information or two-dimensional scrolling for ordinary page content.
- At each supported viewport, no task-critical content or action is clipped, overlapped, or unreachable; intentional scroll regions remain usable.
- Invalid submission identifies affected fields and how to correct them, preserves valid input, and successful submission provides confirmation.
- Each applicable asynchronous path distinguishes waiting, no results/data, success, and failure, with a usable recovery path after failure.
- The original defect is not reproduced, and the same shared component remains correct on at least one other representative route.


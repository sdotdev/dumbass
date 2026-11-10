# Mobile application remediation playbook

Use this playbook for native iOS/Android applications and responsive web apps used on touch devices. Record whether an issue is platform-specific, shared with the web experience, or caused by a device/system condition.

## Triggers

- A key task requires precision, excessive reach, repeated navigation, or an undiscoverable gesture.
- Content or controls are obscured by a system bar, safe area, keyboard, modal, or text scaling.
- Rotation, interruption, backgrounding, app resume, network loss, or permission denial loses progress or creates ambiguity.
- A screen-reader, switch, keyboard, or platform navigation interaction cannot complete the task.
- The responsive web layout overflows or the native app conflicts with platform interaction conventions.

## Evidence to collect

- Record app type (native or web), OS/version, device/model and dimensions, orientation, safe-area configuration, app/browser version, input method, and assistive technology.
- Capture the task, entry point, hand/interaction context where relevant, exact tap/swipe/back sequence, and resulting state.
- Reproduce with system text scaling, virtual keyboard open, portrait and landscape where supported, and a representative smaller and larger device.
- For gestures, record how a user could discover the gesture and whether a visible alternative is available. Check conflict with OS navigation gestures.
- For lifecycle/network findings, record connection state, action in progress, interruption or background/foreground sequence, retained data, duplicate effects, and recovery behavior.
- For permissions, record initial prompt, denial/restriction path, rationale, fallback, and route back to system/app settings where applicable.
- For accessibility, record focus order, labels/roles/states, announcements, target dimensions/spacing, and whether text scaling causes overlap or truncation.

## Fix strategy

1. Reproduce on the named device and identify whether the source is layout, reachability, gesture discoverability, platform convention, accessibility, lifecycle, permission, or network-state handling.
2. Keep the primary task and current context visible. Place frequent actions within comfortable reach when the screen layout allows; avoid making precision the only way to activate a control.
3. Meet applicable touch target requirements (WCAG 2.2 AA minimum 24 by 24 CSS pixels or the defined spacing exception for web; use 44 by 44 points on iOS and 48 by 48 dp on Android as platform design targets where practical). Increase spacing where adjacent actions are easy to confuse.
4. Provide a visible control for actions otherwise available only by swipe, drag, pinch, or long-press. Keep gestures compatible with system back/navigation and expose state changes to assistive technology.
5. Respect safe areas and system bars. Ensure the focused field and its submit/next action remain visible when the keyboard opens; preserve entered content and scroll the focused field into view.
6. Adapt layout to orientation, window size, and text scaling; avoid fixed heights that clip enlarged text. Preserve task state across supported rotation, background/foreground, and interruptions.
7. Model network and lifecycle outcomes explicitly: show when work is pending, completed, queued, offline, or failed; prevent duplicate submissions; explain retry behavior and whether queued work will sync.
8. Request permissions in context and only when needed. On denial, explain the feature impact and provide a functional alternative; allow a clear path to retry when the platform permits.
9. Follow native platform patterns for native controls and navigation; preserve browser semantics and browser back behavior for responsive web. Retest on both platforms if the implementation is shared.

## Anti-patterns

- Requiring an undocumented gesture for a primary action or replacing a standard visible control with a gesture-only shortcut.
- Putting essential actions under a system gesture edge, notch, home indicator, keyboard, or floating system control.
- Using small tightly packed targets because the icons look visually distinct.
- Disabling text scaling, clipping labels, or using fixed-height screens to preserve a mockup.
- Treating native iOS and Android as identical where their navigation, permission, picker, or control conventions differ.
- Asking for permissions at launch without a task context, repeatedly prompting after denial, or blocking unrelated tasks.
- Showing an indefinite spinner during network loss, silently dropping edits, or retrying non-idempotent actions in a way that duplicates a purchase/submission.
- Using a custom back gesture/control that conflicts with system navigation or strands the user in a modal/flow.

## Verification and acceptance criteria

- The named primary task completes on representative small and large supported devices in each supported OS/platform without precision-only interaction.
- Primary controls meet the applicable target-size/spacing requirement; adjacent controls can be activated independently without accidental activation.
- Every essential gesture has a discoverable, operable alternative; VoiceOver/TalkBack exposes the same action and resulting state.
- No task-critical content or action is obscured by safe areas, system UI, overlays, or the virtual keyboard; focused fields and their next actions remain reachable.
- Supported orientation changes and text scaling do not lose task state, overlap controls, or hide task-critical content.
- VoiceOver/TalkBack users can navigate in a meaningful order, identify controls and states, and complete the named task; focus is not stranded after dialogs or transitions.
- Permission denial provides a usable fallback and a clear recovery route; no unrelated core task is blocked by an optional permission.
- Network interruption or app backgrounding yields a clear pending/offline/failed/completed state; user data is preserved according to the stated behavior, retries do not duplicate non-idempotent actions, and resume returns the user to a coherent state.
- Web builds retain semantic links/forms and browser navigation; native builds use expected platform navigation and controls for the supported OS versions.


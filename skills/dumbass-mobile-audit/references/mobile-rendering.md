# Mobile rendering and screenshot evidence v1.0.0

Dumbass evaluates the interface a person sees, so a mobile audit begins with real screenshots and an honest record of how they were made. The renderer may inspect the project to capture the UI. Evaluators never see that inspection: they receive images only.

## Principles

1. **Local first.** Render on the user's own machine whenever it can. Hosted rendering is an optional route, never the default.
2. **Ask before anything leaves the machine or changes the environment.** Installing a tool, editing a build file, making a repository revision available to a hosted runner, and running a workflow each need the user's explicit agreement.
3. **Say what was rendered.** Every screenshot records its renderer, classification, where it ran and its known limits. An approximation is labelled as one and is never called genuine.
4. **Do not substitute silently.** If the right renderer is unavailable, report that and offer alternatives. Do not quietly switch to a different one.
5. **Screenshots only for evaluators.** Source, view hierarchies, renderer output and metadata stay with the controller.

## Choosing a route

The bundled `scripts/cli.mjs` implements this as `detect`, then `select`. `select` never runs anything.

| Target | On macOS | On Windows or Linux |
| --- | --- | --- |
| iOS SwiftUI | `swiftui-render` locally if installed, else the iOS Simulator locally, else report what is missing | Ask whether to use a hosted macOS runner. Decline means no remote run |
| iOS UIKit | iOS Simulator locally | Not supported: no hosted UIKit workflow is provided |
| Android Compose | Mugshot or Paparazzi locally on the JVM | Same, locally. A hosted Linux runner is only an alternative the user may choose |
| Android Views | Paparazzi locally | Same |
| React Native | iOS Simulator (iOS) or adb (Android), capturing the native app | adb for Android. iOS is not supported without a Mac. A web build is rendered only if the user asks for it |
| Mobile web | Browser viewport | Browser viewport |

Android and React Native are never sent to a remote runner just because the user is not on a Mac.

## Classifications

A classification may only be recorded when the capture method genuinely supports it. The evidence layer rejects anything else.

| Classification | Meaning | Methods |
| --- | --- | --- |
| `apple-swiftui` | Apple's SwiftUI, rendered by Apple frameworks | `swiftui-render`, `xcode-simulator` |
| `apple-uikit` | A UIKit screen captured from an iOS runtime | `xcode-simulator` |
| `android-compose` | Compose UI rendered by Android's layout engine or captured from a device | `mugshot`, `paparazzi`, `android-device` |
| `android-views` | Android Views, same ways | `mugshot` (hand-written rule), `paparazzi`, `android-device` |
| `react-native-native` | A React Native app captured from a native runtime | `xcode-simulator`, `android-device` |
| `mobile-web` | A web page in a mobile-sized browser viewport | `browser-viewport` |
| `cross-platform-swift-compatible` | **Approximate.** SwiftOpenUI output, not Apple's SwiftUI | `swiftopenui` (import only) |

A web build of a React Native project is `mobile-web`, never `react-native-native`. Approximate screenshots have status `approximate`, are kept out of evaluator input unless the user approves them, and always appear in the report's limitations.

## What is implemented

Be exact when reporting this. "Mocked" means command construction and output handling are unit tested against a fake runner and the real tool has not been run in this repository's checks.

| Piece | Status |
| --- | --- |
| Environment and project detection, renderer selection, consent records, evidence manifest, evaluator input, frame records | Implemented and tested |
| Mobile web (`browser-viewport`) | Implemented and run against a real browser in `npm run test:browser` |
| `swiftui-render`, `xcode-simulator`, `android-device`, `mugshot`, `paparazzi` | Mocked only |
| Hosted workflows (macOS for `swiftui-render`, Linux for Gradle tools) and the `gh` transport | Mocked only. Never run against live GitHub here |
| `swiftopenui` | Import only. There is no automated capture |
| Hosted UIKit, hosted React Native iOS, headless UIKit | Not provided |

## Remote rendering

Use it only when the user's machine cannot render the platform and the user has agreed.

1. `workflow` prints a workflow for review. It never writes to a repository unless `--write` is given, and never commits or pushes. The user reads it and commits it.
2. `describe-remote` prints exactly what will happen: the repository, the revision, the workflow, the runner, the files that become available to it, the artifacts and their retention, and the cleanup. Show it to the user.
3. Only after the user explicitly agrees to that disclosure, `authorize --user-confirmed` records an authorization. It names one repository, one full commit SHA, one workflow, one runner and one retention period, and it expires within hours. Agreement to "run the audit" is not this approval.
4. `hosted-run` refuses unless the authorization matches the plan. It dispatches the workflow, downloads the screenshots, deletes the remote artifact, removes its temporary download, and records remote provenance.

Dumbass never pushes code. The revision must already be on GitHub. The generated workflow starts only by hand, never from a pull request, requests read-only repository access, receives no secrets from Dumbass, and pins the renderer to a commit the user has reviewed. Artifacts are private workflow artifacts. Credentials belong to the user's `gh` login and are never read, printed or stored by these scripts. The authorization check guards against mistakes; the real boundary is the host's own permission system, which should also prompt for the `gh` calls.

## Evidence layout

Rendering evidence lives beside the existing run artifacts under `.dumbass-runs/<run_id>/` (ignored by Git):

```text
renders/
  render-manifest.json        every screen: captured, approximate, failed, unsupported or missing
  screenshots/<platform>/     the images, with recorded hashes
  evaluator-input/            screen-001.png ... images only, neutral names, metadata removed
  evaluator-mapping.json      controller only: label to screenshot, hashes, classification
sessions/<persona>/frames/    frame records (and images) for the observer's hash checks
capabilities.json             mode static, with the limitations below
```

`render-manifest.json` follows `assets/schemas/render-manifest.schema.json`. A session is `complete` only if every requested screen has an image and nothing failed. A screen that could not be rendered is recorded with a reason, never left out and never replaced with a made-up image.

## What static screenshots can and cannot show

They can support findings about visual hierarchy, layout, typography, contrast, spacing, alignment, clipping, consistency, visible affordances, and empty, loading and error states that appear in the image.

They cannot establish gesture behavior, animation, navigation correctness, keyboard interaction, focus management, screen reader behavior, permission flows, network behavior, hardware integrations, performance, crashes, or real touch-target behavior. Report these as unverified and recommend a separate runtime observation. Rendering is not a device: a renderer's own differences from a device are recorded as limitations on each screenshot.

## Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| `select` says `needs-prerequisites` | A tool or JDK is missing | Read `missing`, explain it, and ask before installing |
| No JDK 17 or later | The JVM tools need it; current releases need 21 | Install a JDK with the user's agreement, or capture from a device or emulator |
| `swiftui-render` fails on a screen | It renders one standalone Swift file defining a Preview view, so app-level dependencies are missing | Record the screen as failed or unsupported with the reason; do not fake it |
| Gradle build fails after adding a tool | Kotlin, Gradle or Android Gradle Plugin versions do not match the tool | Check the tool's current documentation; record the screens as failed |
| Mugshot or Paparazzi produce images but none are collected | Committed images from earlier runs are older than this run | Only files written during the run are collected by design |
| Playwright is missing for mobile web | Not installed | Ask before installing it and a browser |
| Screenshot size differs from the device size | The tool downscaled output | The mismatch is recorded as a limitation; supply `--device-width` and `--device-height` |

## Third-party tools (read 2026-11-11, from each project's public pages)

These are claims from project documentation and have not been independently verified. Re-check before depending on them.

- **swiftui-render** (`olliewagner/swiftui-render`, MIT): headless rendering of a standalone Swift file that defines `struct Preview: View`, using Apple's SwiftUI on macOS 13+ with Xcode Command Line Tools and no simulator. Ten commits by one author, last in March 2026, one release. The README names no limitations section and does not describe plain UIKit views.
- **Mugshot** (`TRazDev/Mugshot`, Apache-2.0): a fork of Paparazzi. Renders Compose previews on the JVM with layoutlib, not Compose Desktop. Needs JDK 21. Writes lossless WebP. First release late August 2026 with several breaking changes since. Android Views only through a hand-written rule.
- **Paparazzi** (`cashapp/paparazzi`, Apache-2.0): layoutlib rendering without a device, for Compose and Views, with snapshot tests you write. The 2.x line is alpha and needs JDK 21; the stable 1.3 line is older.
- **SwiftOpenUI** (`codelynx/SwiftOpenUI`, MIT): an independent SwiftUI-style implementation, not Apple's. It lists no iOS backend and documents no headless rendering, so Dumbass supports only importing screenshots you produce with it, labelled approximate.

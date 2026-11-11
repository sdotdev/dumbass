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
| `dumbass-mobile-audit` | Mobile audit: native iOS, Android, React Native and mobile web, with screenshot rendering |
| `dumbass-novice` | Low-context evaluator |
| `dumbass-expert` | Efficiency-seeking evaluator |
| `dumbass-observe` | Evidence validation and reporting |
| `dumbass-remediate` | Finding-to-change planning |
| `dumbass-fix` | Authorized implementation and retesting |

## Mobile apps and mobile web

`dumbass-mobile-audit` captures real screenshots of native iOS (SwiftUI, UIKit), native Android (Jetpack Compose, Views), React Native and mobile web, then runs the same screenshot-only novice and expert evaluation. It is local first and honest about what each screenshot is.

| Target | Local route | Genuine? |
| --- | --- | --- |
| iOS SwiftUI | `swiftui-render` or the iOS Simulator, on macOS | Yes. Apple's SwiftUI |
| iOS UIKit | iOS Simulator, on macOS | Yes |
| Android Compose and Views | Mugshot or Paparazzi on the JVM, or a device or emulator through adb | Yes. layoutlib rendering or a real runtime |
| React Native | iOS Simulator or adb, capturing the native app | Yes |
| Mobile web | A browser viewport | Web evidence only |

- **Genuine Apple rendering needs macOS.** On Windows or Linux the skill asks whether you want a GitHub-hosted macOS runner. It never starts one on its own. Choosing it means a specific commit of your repository becomes available to the runner, a workflow runs there, and the screenshots come back as private artifacts that are deleted after download. Dumbass never pushes code, never writes secrets, and never commits the workflow for you; you review and commit it. Declining means nothing runs remotely. A clearly labelled approximation (SwiftOpenUI output you produce yourself) is the only fallback and is never called Apple SwiftUI.
- **Android and React Native are not sent to a remote runner just because you are not on a Mac.** The JVM route and adb work on Windows, Linux and macOS.
- **Nothing is installed or edited without asking.** Missing tools are reported, not installed. Tools that need a Gradle plugin, snapshot tests or a Swift preview file are described first.
- **Every screenshot records how it was made**: renderer, classification (`apple-swiftui`, `android-compose`, `react-native-native`, `mobile-web`, and the approximate `cross-platform-swift-compatible`), where it ran, device size and scale, theme and known limits. A web build of a React Native app is labelled mobile web, never native.
- **Evaluators receive images only**, with neutral names and embedded metadata removed. Source, view hierarchies, renderer names and tool output never reach them.
- **Static screenshots cannot show** gestures, animation, keyboard behavior, focus, screen readers, permissions, network, performance or real touch behavior. Reports list these as unverified.

**What is implemented, exactly.** Mobile web is run against a real browser in `npm run test:browser`. Detection, renderer selection, consent, the evidence manifest and the evaluator boundary are implemented and unit tested. The `swiftui-render`, Simulator, adb, Mugshot and Paparazzi routes and the hosted workflows are tested against fakes only: their command construction and output handling are checked, but the real tools and live GitHub have not been run in this repository's checks. SwiftOpenUI is import-only. Hosted UIKit, hosted React Native iOS and headless UIKit are not provided. See [mobile rendering](protocol/mobile-rendering.md) for routes, remote-rendering steps and troubleshooting.

Optional dependencies only: installing Dumbass needs just Node. Playwright, Xcode tools, a JDK and adb are detected when present and requested only for the route you choose.

## How the skills fit together

A typical run is `dumbass-audit` (or the dashboard or mobile variant) → `dumbass-novice` and `dumbass-expert` in separate contexts → `dumbass-observe` → optionally `dumbass-remediate` → `dumbass-fix`. Each skill names its neighbors and still works when installed alone, falling back to its bundled persona cards and protocol. `dumbass-remediate` and `dumbass-fix` also bundle the [remediation playbooks](playbooks/general-web.md). Audit output goes to `.dumbass-runs/<run_id>/`, which is gitignored.

## Install

Install through the Skills CLI (recommended):

```bash
npx skills add sdotdev/dumbass --all
```

List the available skills without installing:

```bash
npx skills add sdotdev/dumbass --list
```

Install only one skill with `--skill dumbass-audit`, or omit `--all` for interactive selection.

Alternatively, clone the repository and use its portable installer.

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

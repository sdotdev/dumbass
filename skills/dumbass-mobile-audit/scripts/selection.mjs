import { classificationFor, METHODS } from "./contracts.mjs";
import { javaMajor, macosMajor } from "./environment.mjs";

/**
 * @typedef {"ready" | "needs-prerequisites" | "needs-consent" | "needs-input" | "declined" | "unsupported"} DecisionStatus
 * @typedef {{
 *   status: DecisionStatus,
 *   platform: string | null, framework: string | null,
 *   renderer: { method: string, location: "local" | "remote", classification: string, genuine: boolean, hostOs: string } | null,
 *   reasons: string[],
 *   questions: { id: string, text: string, options?: string[] }[],
 *   missing: { tool: string, why: string }[],
 *   alternatives: { method: string, location: "local" | "remote", classification: string | null, genuine: boolean, note: string }[],
 *   projectChanges: string[],
 *   remote: null | { provider: "github-actions", runner: "macos" | "linux", needs: string[] }
 * }} Decision
 */

const REMOTE_NEEDS = [
  "Make the project's repository and a specific revision available to a GitHub-hosted runner",
  "Run a workflow on that runner",
  "Retrieve the generated screenshots as private artifacts, kept for a retention period you choose",
];

function base(overrides) {
  return {
    status: "unsupported", platform: null, framework: null, renderer: null,
    reasons: [], questions: [], missing: [], alternatives: [], projectChanges: [], remote: null,
    ...overrides,
  };
}

function renderer(method, location, framework) {
  const descriptor = METHODS[method];
  const classification = classificationFor(method, framework);
  return {
    method, location, classification,
    genuine: classification !== "cross-platform-swift-compatible",
    hostOs: location === "remote" ? (descriptor.hostOs[0] ?? "unknown") : "local",
  };
}

function alt(method, location, framework, note) {
  const classification = classificationFor(method, framework);
  return { method, location, classification, genuine: classification !== null && classification !== "cross-platform-swift-compatible", note };
}

const tool = (env, name) => env.tools?.[name] ?? { found: false, version: null };

function resolveTarget(project, request) {
  if (request.platform === "mobile-web" || (request.url && !request.platform)) return { platform: "mobile-web", framework: "web" };
  if (request.platform && request.framework) return { platform: request.platform, framework: request.framework };
  const candidates = (project?.candidates ?? []).filter((c) => (!request.platform || c.platform === request.platform) && (!request.framework || c.framework === request.framework));
  if (candidates.length === 1) return { platform: candidates[0].platform, framework: candidates[0].framework };
  if (request.platform === "react-native") return { platform: "react-native", framework: "react-native" };
  return { candidates };
}

/**
 * Chooses a rendering route. Pure: it reads the environment snapshot, project facts and the user's
 * stated choices, and never starts anything. Hosted rendering is only ever the result of an explicit
 * "granted" answer; "unasked" yields needs-consent and "declined" blocks it.
 * @param {{ env: import("./environment.mjs").Environment, project?: import("./project.mjs").ProjectInfo | null, request?: { platform?: string, framework?: string, target?: string, url?: string }, consent?: { remote?: "unasked" | "granted" | "declined" } }} input
 * @returns {Decision}
 */
export function selectRenderer({ env, project = null, request = {}, consent = {} }) {
  const remoteConsent = consent.remote ?? "unasked";
  const target = resolveTarget(project, request);
  if ("candidates" in target) {
    const found = target.candidates;
    return base({
      status: "needs-input",
      reasons: [found.length ? "More than one kind of mobile app was found." : "No mobile app type could be identified from the project."],
      questions: [{
        id: "platform",
        text: found.length ? "Which app should be audited?" : "What kind of app is this (iOS SwiftUI, iOS UIKit, Android Compose, Android Views, React Native, or a mobile website)?",
        options: found.length ? found.map((c) => `${c.platform}/${c.framework}`) : ["ios/swiftui", "ios/uikit", "android/compose", "android/android-views", "react-native/react-native", "mobile-web/web"],
      }],
    });
  }
  const { platform, framework } = target;
  const common = { platform, framework };
  if (platform === "mobile-web") return selectMobileWeb(env, common);
  if (platform === "ios") return selectIos(env, common, remoteConsent);
  if (platform === "android") return selectAndroid(env, project, common);
  if (platform === "react-native") return selectReactNative(env, project, common, request);
  return base({ ...common, reasons: [`Unknown platform ${platform}.`] });
}

function selectMobileWeb(env, common) {
  const playwright = env.tools?.playwright;
  if (playwright && !playwright.found) {
    return base({ ...common, status: "needs-prerequisites", missing: [{ tool: "playwright", why: "Needed to render a mobile viewport in a browser. Ask before installing it." }], reasons: ["Mobile web uses the browser renderer."] });
  }
  return base({ ...common, status: "ready", renderer: renderer("browser-viewport", "local", "web"), reasons: ["Mobile web is rendered locally in a browser viewport. This is web evidence, not native app evidence."] });
}

function selectIos(env, common, remoteConsent) {
  const { framework } = common;
  if (framework !== "swiftui" && framework !== "uikit") {
    return base({ ...common, status: "needs-input", questions: [{ id: "ios-framework", text: "Is the screen built with SwiftUI or UIKit?", options: ["swiftui", "uikit"] }], reasons: ["The iOS framework is not known."] });
  }
  const mac = env.os === "macos";
  const simctl = mac && tool(env, "xcrun").found;
  if (framework === "uikit") {
    if (mac && simctl) {
      return base({ ...common, status: "ready", renderer: renderer("xcode-simulator", "local", "uikit"),
        reasons: ["UIKit screens can only be captured from a real iOS runtime. This Mac has Xcode tooling, so the simulator is used locally."],
        projectChanges: [], questions: [] });
    }
    if (mac) {
      return base({ ...common, status: "needs-prerequisites", missing: [{ tool: "xcrun", why: "Xcode command-line tools with the iOS Simulator are needed to capture UIKit screens. Ask before installing." }], reasons: ["No headless UIKit renderer exists in this suite."] });
    }
    return base({ ...common, status: "unsupported", reasons: [
      "Genuine UIKit rendering needs macOS with an iOS Simulator.",
      "A hosted macOS UIKit workflow is not provided in this release, so no remote route is offered.",
      "Run the audit on a Mac, or supply screenshots you captured yourself; those are treated as supplied evidence, not as renderer output.",
    ] });
  }
  // SwiftUI
  if (mac) {
    const sr = tool(env, "swiftui-render");
    const major = macosMajor(env);
    if (sr.found && (major === null || major >= 13)) {
      return base({ ...common, status: "ready", renderer: renderer("swiftui-render", "local", "swiftui"),
        reasons: ["Genuine Apple SwiftUI rendering is available locally, so nothing is uploaded and no hosted workflow is used."],
        projectChanges: ["Each screen needs a self-contained Swift file that defines a Preview view; this is not done automatically."],
        alternatives: simctl ? [alt("xcode-simulator", "local", "swiftui", "Captures a running app in a booted simulator instead of a standalone view.")] : [] });
    }
    if (sr.found && major !== null && major < 13) {
      return base({ ...common, status: "needs-prerequisites", missing: [{ tool: "macOS 13 or later", why: "swiftui-render requires macOS 13." }], reasons: [`macOS ${env.macosVersion} is too old for swiftui-render.`],
        alternatives: simctl ? [alt("xcode-simulator", "local", "swiftui", "Works with a booted simulator.")] : [] });
    }
    if (simctl) {
      return base({ ...common, status: "ready", renderer: renderer("xcode-simulator", "local", "swiftui"),
        reasons: ["swiftui-render is not installed, but Xcode's simulator tooling is, so it is used locally without installing anything."],
        alternatives: [alt("swiftui-render", "local", "swiftui", "Headless rendering without a simulator; requires installing swiftui-render, which needs your approval.")] });
    }
    return base({ ...common, status: "needs-prerequisites",
      missing: [
        { tool: "swiftui-render", why: "Headless SwiftUI rendering. Needs Xcode command-line tools and macOS 13 or later. Ask before installing." },
        { tool: "xcrun", why: "Or Xcode with the iOS Simulator, to capture a running app." },
      ],
      reasons: ["Genuine local rendering is possible on this Mac, but no renderer is installed yet. Nothing was installed."] });
  }
  // Windows, Linux or unknown: Apple rendering needs macOS.
  const remote = { provider: "github-actions", runner: "macos", needs: REMOTE_NEEDS };
  const approximation = alt("swiftopenui", "local", "swiftui", "Not Apple's SwiftUI and has no iOS backend. Only imported output is supported, and it is always labelled approximate.");
  if (remoteConsent === "granted") {
    return base({ ...common, status: "ready", renderer: renderer("swiftui-render", "remote", "swiftui"), remote,
      reasons: ["Genuine Apple SwiftUI rendering needs macOS. You chose a hosted macOS runner; a scoped authorization is still required before anything is sent or run."],
      projectChanges: ["Each screen needs a self-contained Swift file that defines a Preview view, committed at the revision to be rendered."] });
  }
  if (remoteConsent === "declined") {
    return base({ ...common, status: "declined", alternatives: [approximation],
      reasons: ["Genuine Apple SwiftUI rendering needs macOS, and hosted rendering was declined. No remote workflow will run.", "An approximate render is possible only from SwiftOpenUI output you produce yourself, and it would be labelled cross-platform-swift-compatible, never apple-swiftui."] });
  }
  return base({ ...common, status: "needs-consent", remote, alternatives: [approximation],
    questions: [{ id: "hosted-macos", text: "Genuine Apple SwiftUI rendering needs macOS. Do you want to use a GitHub-hosted macOS runner? That makes your repository revision available to the runner, runs a workflow, and returns screenshots as private artifacts.", options: ["yes", "no"] }],
    reasons: ["This computer cannot render Apple SwiftUI. Hosted rendering is optional and has not been started."] });
}

function selectAndroid(env, project, common) {
  const { framework } = common;
  const android = project?.android;
  const jdk = tool(env, "java");
  const major = javaMajor(jdk.version);
  const adb = tool(env, "adb").found;
  const gradleOk = Boolean(android?.hasWrapper || tool(env, "gradle").found);
  const deviceAlt = adb ? [alt("android-device", "local", framework, "Captures a connected device or emulator that is already showing the screen.")] : [];
  if (!android?.hasGradleBuild) {
    return base({ ...common, status: "needs-input", reasons: ["No Gradle Android project was found at the given location."], questions: [{ id: "android-project", text: "Where is the Android project (the folder with settings.gradle)?" }], alternatives: deviceAlt });
  }
  if (!gradleOk) {
    return base({ ...common, status: "needs-prerequisites", missing: [{ tool: "gradle", why: "The project has no Gradle wrapper and Gradle is not installed. Ask before installing." }], reasons: ["The JVM screenshot route runs through Gradle."], alternatives: deviceAlt });
  }
  if (major === null || major < 17) {
    return base({ ...common, status: "needs-prerequisites", missing: [{ tool: "JDK 17 or later (21 for current releases)", why: major === null ? "No JDK was found." : `JDK ${major} is too old for the JVM screenshot tools.` }],
      reasons: ["A JVM-based renderer avoids needing an emulator, but it needs a newer JDK. Nothing was installed."],
      alternatives: [...deviceAlt, alt("paparazzi", "remote", framework, "A hosted Linux runner could render it, but only after you explicitly authorize that; it is not used automatically.")] });
  }
  let method;
  let why;
  if (android.usesMugshot && major >= 21) { method = "mugshot"; why = "the project already uses Mugshot"; }
  else if (android.usesPaparazzi) { method = "paparazzi"; why = "the project already uses Paparazzi"; }
  else if (framework === "compose" && android.composePreviews > 0 && major >= 21) { method = "mugshot"; why = "the project has Compose previews that Mugshot can capture with one annotation each"; }
  else { method = "paparazzi"; why = framework === "android-views" ? "Paparazzi can inflate traditional Views" : "Paparazzi is the more established JVM renderer"; }
  const other = method === "mugshot" ? "paparazzi" : "mugshot";
  const otherUsable = other === "paparazzi" || major >= 21;
  const reasons = [`Rendering locally on the JVM, so no emulator or Android Studio is required; ${why}.`];
  if (major < 21) reasons.push(`JDK ${major} supports the stable Paparazzi 1.3 line; the current alpha and Mugshot need JDK 21.`);
  return base({ ...common, status: "ready", renderer: renderer(method, "local", framework), reasons,
    projectChanges: method === "mugshot"
      ? ["Apply the Mugshot Gradle plugin and KSP, and annotate preview composables. This changes build files and needs your approval."]
      : ["Apply the Paparazzi Gradle plugin and add snapshot tests for the screens. This changes build files and needs your approval."],
    alternatives: [...(otherUsable ? [alt(other, "local", framework, "Another JVM renderer that could capture the same screens.")] : []), ...deviceAlt] });
}

function selectReactNative(env, project, common, request) {
  const mac = env.os === "macos";
  const iosAvail = mac && tool(env, "xcrun").found;
  const androidAvail = tool(env, "adb").found;
  const web = alt("browser-viewport", "local", "web", "A web build rendered in a browser. This is web evidence only and is never presented as native React Native.");
  let target = request.target;
  if (!target) {
    if (iosAvail && !androidAvail) target = "ios";
    else if (androidAvail && !iosAvail) target = "android";
    else if (iosAvail && androidAvail) {
      return base({ ...common, status: "needs-input", questions: [{ id: "rn-target", text: "Which native platform should be captured?", options: ["ios", "android"] }], reasons: ["Both iOS and Android capture are possible here."] });
    } else {
      return base({ ...common, status: "needs-prerequisites",
        missing: [{ tool: mac ? "iOS Simulator (xcrun) or adb with an emulator" : "adb with an Android emulator or device", why: "A genuine React Native screenshot needs a native runtime showing the app." }],
        reasons: ["No native runtime is available. A web build can be rendered, but that is labelled mobile web and is not native evidence."], alternatives: [web] });
    }
  }
  if (target === "web") {
    return base({ ...common, platform: "mobile-web", framework: "web", status: "ready", renderer: renderer("browser-viewport", "local", "web"),
      reasons: ["You asked for the web build. This is labelled mobile-web and says nothing about how the native app looks."] });
  }
  if (target === "ios") {
    if (iosAvail) {
      return base({ ...common, status: "ready", renderer: renderer("xcode-simulator", "local", "react-native"), reasons: ["The app is captured from a booted iOS Simulator on this Mac. It must already be running and showing the screen."],
        projectChanges: [], alternatives: [web] });
    }
    return base({ ...common, status: "unsupported",
      reasons: [mac ? "Xcode's simulator tooling was not found." : "A genuine React Native iOS capture needs macOS with an iOS Simulator.", "A hosted macOS simulator workflow is not provided in this release, so no remote route is offered."],
      missing: mac ? [{ tool: "xcrun", why: "Xcode command-line tools with the iOS Simulator." }] : [], alternatives: [web] });
  }
  if (target === "android") {
    if (androidAvail) {
      return base({ ...common, status: "ready", renderer: renderer("android-device", "local", "react-native"), reasons: ["The app is captured from a connected Android device or emulator through adb. It must already be running and showing the screen."], alternatives: [web] });
    }
    return base({ ...common, status: "needs-prerequisites", missing: [{ tool: "adb", why: "Android platform tools plus an emulator or device are needed to capture the native app. Ask before installing." }], reasons: ["No Android runtime is reachable."], alternatives: [web] });
  }
  return base({ ...common, status: "needs-input", questions: [{ id: "rn-target", text: "Which native platform should be captured?", options: ["ios", "android", "web"] }], reasons: [`Unknown target ${target}.`] });
}

// Shared contracts for mobile rendering. The method table below is the single place that decides
// which renderer may be described as what. Evidence that claims a classification its method cannot
// support is rejected, so an approximation can never be presented as genuine platform output.

export const SCHEMA_VERSION = "1.0.0";

export const PLATFORMS = ["ios", "android", "react-native", "mobile-web"];
export const FRAMEWORKS = ["swiftui", "uikit", "compose", "android-views", "react-native", "web", "unknown"];
export const RENDER_STATUSES = ["captured", "approximate", "failed", "unsupported", "missing"];
export const CLASSIFICATIONS = [
  "apple-swiftui",
  "apple-uikit",
  "android-compose",
  "android-views",
  "react-native-native",
  "mobile-web",
  "cross-platform-swift-compatible",
];

/** Each classification can only describe a screen built with a matching framework. */
export const CLASSIFICATION_FRAMEWORK = {
  "apple-swiftui": ["swiftui"],
  "apple-uikit": ["uikit"],
  "android-compose": ["compose"],
  "android-views": ["android-views"],
  "react-native-native": ["react-native"],
  "mobile-web": ["web"],
  "cross-platform-swift-compatible": ["swiftui"],
};

/** Classifications that are not genuine platform output. */
export const APPROXIMATE_CLASSIFICATIONS = new Set(["cross-platform-swift-compatible"]);

/**
 * What each capture method really is.
 * verification says how far this repository has exercised the integration:
 *   exercised     - run against the real tool in this repository's checks
 *   mocked        - command construction and output handling are unit tested with a fake runner; the real tool has not been run here
 *   ingest-only   - there is no automated capture; only output already produced by the tool can be imported
 */
export const METHODS = Object.freeze({
  "swiftui-render": {
    name: "swiftui-render",
    summary: "Headless SwiftUI rendering from the command line",
    platforms: ["ios"],
    frameworks: ["swiftui"],
    classifications: ["apple-swiftui"],
    hostOs: ["macos"],
    locations: ["local", "remote"],
    mediaTypes: ["image/png"],
    verification: "mocked",
    limitations: [
      "Renders a standalone Swift file that defines a Preview view, not a running app, so navigation, app state and app-level dependencies are not reproduced",
      "Renders on macOS (ImageRenderer, an offscreen window or Mac Catalyst), not on the iOS runtime, so iOS-only controls and system chrome can differ",
      "Plain UIKit views are not supported; UIKit appears only inside a SwiftUI hosting controller",
      "A young single-maintainer project; behavior across SwiftUI versions has not been verified here",
    ],
  },
  "xcode-simulator": {
    name: "Xcode iOS Simulator screenshot",
    summary: "Screenshot of the screen currently shown in a booted iOS Simulator",
    platforms: ["ios", "react-native"],
    frameworks: ["swiftui", "uikit", "react-native"],
    classifications: ["apple-swiftui", "apple-uikit", "react-native-native"],
    hostOs: ["macos"],
    locations: ["local"],
    mediaTypes: ["image/png"],
    verification: "mocked",
    limitations: [
      "Captures only the state the simulator is currently showing; reaching each screen is the user's or a UI test's job",
      "A simulator is not a physical device: performance, haptics, camera and hardware integrations are not represented",
    ],
  },
  swiftopenui: {
    name: "SwiftOpenUI",
    summary: "Independent cross-platform SwiftUI-style framework (not Apple's SwiftUI)",
    platforms: ["ios"],
    frameworks: ["swiftui"],
    classifications: ["cross-platform-swift-compatible"],
    hostOs: ["macos", "linux", "windows"],
    locations: ["local"],
    mediaTypes: ["image/png"],
    verification: "ingest-only",
    limitations: [
      "Not Apple's SwiftUI: fonts, system symbols, spacing and control styling come from another implementation",
      "Has no iOS backend, so the image does not show iOS chrome or iOS control appearance",
      "The app usually needs its entry point and imports adapted, so the rendered screen may differ from the shipped app",
    ],
  },
  mugshot: {
    name: "Mugshot",
    summary: "Compose preview screenshots rendered on the JVM with layoutlib",
    platforms: ["android"],
    frameworks: ["compose", "android-views"],
    classifications: ["android-compose", "android-views"],
    hostOs: ["macos", "linux", "windows"],
    locations: ["local", "remote"],
    mediaTypes: ["image/webp", "image/png"],
    verification: "mocked",
    limitations: [
      "Rendered by layoutlib on a JVM, not on a device or emulator, so device-specific rendering can differ",
      "One static frame per preview: animations, accessibility output and runtime state transitions are not captured",
      "Output is downscaled by default, so pixel dimensions are smaller than device pixels",
      "A very young project with frequent breaking changes; Kotlin, Gradle and Android Gradle Plugin compatibility is not stated and must be tried",
    ],
  },
  paparazzi: {
    name: "Paparazzi",
    summary: "Android screenshots rendered on the JVM with layoutlib",
    platforms: ["android"],
    frameworks: ["compose", "android-views"],
    classifications: ["android-compose", "android-views"],
    hostOs: ["macos", "linux", "windows"],
    locations: ["local", "remote"],
    mediaTypes: ["image/png"],
    verification: "mocked",
    limitations: [
      "Rendered by layoutlib on a JVM, not on a device or emulator, so device-specific rendering can differ",
      "Needs snapshot test code in the project; screens without a test are not captured",
      "WebViews, platform services and animations are not represented",
      "The 2.x line is alpha; the stable 1.3 line needs an older toolchain",
    ],
  },
  "android-device": {
    name: "Android device or emulator screenshot",
    summary: "Screenshot of the screen currently shown on a connected Android device or emulator",
    platforms: ["android", "react-native"],
    frameworks: ["compose", "android-views", "react-native"],
    classifications: ["android-compose", "android-views", "react-native-native"],
    hostOs: ["macos", "linux", "windows"],
    locations: ["local"],
    mediaTypes: ["image/png"],
    verification: "mocked",
    limitations: [
      "Captures only the state the device is currently showing; reaching each screen is the user's or a UI test's job",
      "An emulator is not a physical device: performance and hardware integrations are not represented",
    ],
  },
  "browser-viewport": {
    name: "Browser mobile viewport",
    summary: "Mobile-sized viewport emulation in a desktop browser engine",
    platforms: ["mobile-web"],
    frameworks: ["web"],
    classifications: ["mobile-web"],
    hostOs: ["macos", "linux", "windows"],
    locations: ["local"],
    mediaTypes: ["image/png"],
    verification: "exercised",
    limitations: [
      "Viewport emulation in a desktop browser engine is not a mobile browser on a device",
      "Safe areas, the on-screen keyboard, native gestures and real-device performance are not represented",
      "A web rendering says nothing about how a native app looks",
    ],
  },
});

export const METHOD_IDS = Object.freeze(Object.keys(METHODS));

/** Static screenshots cannot establish any of these; every mobile report must say so. */
export const STATIC_EVIDENCE_LIMITS = [
  "Gesture behavior, animation quality, navigation correctness and runtime state transitions are not established by static screenshots",
  "Keyboard interaction, focus management and screen reader behavior are not established by static screenshots",
  "Permission flows, network behavior, hardware integrations, performance and crashes are not established by static screenshots",
  "Actual touch target behavior is not established; apparent size in an image is not physical size",
];

export class ContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "ContractError";
  }
}

/**
 * Throws unless the method can genuinely support the classification for this framework.
 * @param {string} method
 * @param {string} classification
 * @param {string} framework
 */
export function assertClassification(method, classification, framework) {
  const descriptor = METHODS[method];
  if (!descriptor) throw new ContractError(`Unknown capture method ${method}`);
  if (!CLASSIFICATIONS.includes(classification)) throw new ContractError(`Unknown classification ${classification}`);
  if (!descriptor.classifications.includes(classification)) {
    throw new ContractError(`Method ${method} cannot support classification ${classification}`);
  }
  if (!CLASSIFICATION_FRAMEWORK[classification].includes(framework)) {
    throw new ContractError(`Classification ${classification} does not describe framework ${framework}`);
  }
}

/** The one classification a method yields for a framework, or null if the method cannot render that framework. */
export function classificationFor(method, framework) {
  const descriptor = METHODS[method];
  if (!descriptor) return null;
  return descriptor.classifications.find((c) => CLASSIFICATION_FRAMEWORK[c].includes(framework)) ?? null;
}

export function isApproximate(classification) {
  return APPROXIMATE_CLASSIFICATIONS.has(classification);
}

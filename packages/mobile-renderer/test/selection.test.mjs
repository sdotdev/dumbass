import assert from "node:assert/strict";
import test from "node:test";
import { selectRenderer } from "../src/selection.mjs";
import { found, makeEnv } from "./helpers.mjs";

const swiftui = { candidates: [{ platform: "ios", framework: "swiftui", evidence: [] }] };
const uikit = { candidates: [{ platform: "ios", framework: "uikit", evidence: [] }] };
const compose = (android = {}) => ({ candidates: [{ platform: "android", framework: "compose", evidence: [] }], android: { hasGradleBuild: true, hasWrapper: true, compose: true, composePreviews: 0, layoutXml: 0, usesPaparazzi: false, usesMugshot: false, ...android } });
const views = { candidates: [{ platform: "android", framework: "android-views", evidence: [] }], android: { hasGradleBuild: true, hasWrapper: true, compose: false, composePreviews: 0, layoutXml: 3, usesPaparazzi: false, usesMugshot: false } };
const rn = { candidates: [{ platform: "react-native", framework: "react-native", evidence: [] }], reactNative: { present: true, expo: false, version: "0.76", hasIos: true, hasAndroid: true } };

const select = (env, project, request = {}, consent = {}) => selectRenderer({ env, project, request, consent });

// ---- Example A: macOS with SwiftUI
test("macOS + SwiftUI with swiftui-render uses genuine local Apple rendering and offers no hosted route", () => {
  const d = select(makeEnv("macos", { swiftui_render: false, "swiftui-render": found(), xcrun: true, xcodebuild: found("16.2") }), swiftui);
  assert.equal(d.status, "ready");
  assert.deepEqual([d.renderer.method, d.renderer.location, d.renderer.classification, d.renderer.genuine], ["swiftui-render", "local", "apple-swiftui", true]);
  assert.equal(d.remote, null);
  assert.equal(d.questions.length, 0, "nothing to ask when the route is clear");
});

test("macOS never selects hosted rendering, even if remote consent was granted", () => {
  for (const consent of ["unasked", "granted", "declined"]) {
    const d = select(makeEnv("macos", { "swiftui-render": found(), xcrun: true }), swiftui, {}, { remote: consent });
    assert.equal(d.renderer.location, "local", `consent ${consent}`);
    assert.equal(d.remote, null);
  }
});

test("macOS without swiftui-render but with Xcode simulator tooling uses the simulator and installs nothing", () => {
  const d = select(makeEnv("macos", { xcrun: true }), swiftui);
  assert.equal(d.status, "ready");
  assert.equal(d.renderer.method, "xcode-simulator");
  assert.equal(d.renderer.classification, "apple-swiftui");
  assert.ok(d.alternatives.some((a) => a.method === "swiftui-render"));
});

test("macOS with no renderer reports what is missing and does not choose a remote route", () => {
  const d = select(makeEnv("macos"), swiftui);
  assert.equal(d.status, "needs-prerequisites");
  assert.equal(d.renderer, null);
  assert.equal(d.remote, null);
  assert.ok(d.missing.some((m) => m.tool === "swiftui-render"));
  assert.match(d.reasons.join(" "), /Nothing was installed/);
});

test("an old macOS blocks swiftui-render rather than failing later", () => {
  const d = select(makeEnv("macos", { "swiftui-render": found() }, { macosVersion: "12.6" }), swiftui);
  assert.equal(d.status, "needs-prerequisites");
  assert.ok(d.missing.some((m) => /macOS 13/.test(m.tool)));
});

// ---- Example B: Windows with SwiftUI
for (const os of ["windows", "linux", "unknown"]) {
  test(`${os} + SwiftUI asks before hosted macOS rendering and selects nothing`, () => {
    const d = select(makeEnv(os), swiftui);
    assert.equal(d.status, "needs-consent");
    assert.equal(d.renderer, null, "no renderer is selected before the user answers");
    assert.equal(d.remote.runner, "macos");
    assert.ok(d.remote.needs.length >= 3);
    assert.equal(d.questions[0].id, "hosted-macos");
    assert.match(d.reasons.join(" "), /has not been started/);
  });
}

test("accepting hosted rendering selects a remote genuine Apple renderer", () => {
  const d = select(makeEnv("windows"), swiftui, {}, { remote: "granted" });
  assert.equal(d.status, "ready");
  assert.deepEqual([d.renderer.location, d.renderer.classification, d.renderer.genuine], ["remote", "apple-swiftui", true]);
});

test("declining hosted rendering blocks remote execution and offers only a labelled approximation", () => {
  const d = select(makeEnv("windows"), swiftui, {}, { remote: "declined" });
  assert.equal(d.status, "declined");
  assert.equal(d.renderer, null);
  assert.equal(d.remote, null);
  const approx = d.alternatives.find((a) => a.method === "swiftopenui");
  assert.equal(approx.genuine, false);
  assert.equal(approx.classification, "cross-platform-swift-compatible");
  assert.ok(d.alternatives.every((a) => a.classification !== "apple-swiftui"), "an approximation must never be offered as Apple SwiftUI");
});

test("declining remote rendering never yields a remote renderer on any platform", () => {
  const cases = [[makeEnv("windows"), swiftui], [makeEnv("linux"), swiftui], [makeEnv("linux"), uikit], [makeEnv("windows"), rn], [makeEnv("linux"), compose()]];
  for (const [env, project] of cases) {
    const d = select(env, project, { target: "ios" }, { remote: "declined" });
    assert.notEqual(d.renderer?.location, "remote");
    assert.equal(d.remote, null);
  }
});

// ---- UIKit
test("UIKit on a Mac uses the simulator and is classified apple-uikit", () => {
  const d = select(makeEnv("macos", { xcrun: true }), uikit);
  assert.deepEqual([d.status, d.renderer.method, d.renderer.classification], ["ready", "xcode-simulator", "apple-uikit"]);
});

test("UIKit off macOS is unsupported and honest that no hosted route exists", () => {
  const d = select(makeEnv("linux"), uikit, {}, { remote: "granted" });
  assert.equal(d.status, "unsupported");
  assert.equal(d.renderer, null);
  assert.match(d.reasons.join(" "), /not provided in this release/);
});

// ---- Example C: Linux with Compose
test("Linux + Compose with JDK 21 and previews picks Mugshot locally and never goes remote", () => {
  const d = select(makeEnv("linux", { java: found("21.0.2") }), compose({ composePreviews: 4 }));
  assert.deepEqual([d.status, d.renderer.method, d.renderer.location, d.renderer.classification], ["ready", "mugshot", "local", "android-compose"]);
  assert.equal(d.remote, null);
  assert.ok(d.projectChanges.length > 0 && /approval/.test(d.projectChanges[0]), "build changes must be flagged as needing approval");
  assert.ok(d.alternatives.some((a) => a.method === "paparazzi"));
});

test("a project that already uses Paparazzi keeps Paparazzi", () => {
  const d = select(makeEnv("linux", { java: found("21.0.2") }), compose({ usesPaparazzi: true, composePreviews: 9 }));
  assert.equal(d.renderer.method, "paparazzi");
});

test("JDK 17 supports Paparazzi but not Mugshot", () => {
  const d = select(makeEnv("linux", { java: found("17.0.10") }), compose({ composePreviews: 9 }));
  assert.equal(d.renderer.method, "paparazzi");
  assert.ok(d.alternatives.every((a) => a.method !== "mugshot"));
});

test("Windows + Compose renders locally on the JVM; Windows is not forced onto a remote runner", () => {
  const d = select(makeEnv("windows", { java: found("21.0.2") }), compose());
  assert.equal(d.status, "ready");
  assert.equal(d.renderer.location, "local");
  assert.equal(d.remote, null);
});

test("Compose without a usable JDK reports the gap and only lists a remote runner as an unused alternative", () => {
  for (const java of [undefined, found("11.0.2")]) {
    const d = select(makeEnv("linux", java ? { java } : {}), compose());
    assert.equal(d.status, "needs-prerequisites");
    assert.equal(d.renderer, null);
    assert.equal(d.remote, null, "remote execution is not selected, so nothing can start");
    const remote = d.alternatives.find((a) => a.location === "remote");
    assert.match(remote.note, /only after you explicitly authorize/);
  }
});

test("Android Views use Paparazzi, not a Compose-only route", () => {
  const d = select(makeEnv("linux", { java: found("21.0.2") }), views);
  assert.deepEqual([d.renderer.method, d.renderer.classification], ["paparazzi", "android-views"]);
});

test("an Android project without Gradle asks where the project is", () => {
  const d = select(makeEnv("linux", { java: found("21.0.2") }), { candidates: compose().candidates, android: { hasGradleBuild: false } });
  assert.equal(d.status, "needs-input");
});

// ---- Examples D and E: React Native
test("React Native on a Mac with iOS and Android both available asks which to capture", () => {
  const d = select(makeEnv("macos", { xcrun: true, adb: found("35") }), rn);
  assert.equal(d.status, "needs-input");
  assert.equal(d.questions[0].id, "rn-target");
});

test("React Native iOS on a Mac captures the native app, not a web rendering", () => {
  const d = select(makeEnv("macos", { xcrun: true }), rn);
  assert.deepEqual([d.renderer.method, d.renderer.classification], ["xcode-simulator", "react-native-native"]);
  assert.notEqual(d.renderer.method, "browser-viewport");
  assert.ok(d.alternatives.find((a) => a.method === "browser-viewport").note.match(/never presented as native/));
});

test("React Native on Windows with an Android device picks Android locally without asking", () => {
  const d = select(makeEnv("windows", { adb: found("35") }), rn);
  assert.deepEqual([d.status, d.renderer.method, d.renderer.location, d.renderer.classification], ["ready", "android-device", "local", "react-native-native"]);
});

test("React Native iOS on Windows is unsupported, never silently swapped for web, and no hosted route is faked", () => {
  const d = select(makeEnv("windows", { adb: found("35") }), rn, { target: "ios" }, { remote: "granted" });
  assert.equal(d.status, "unsupported");
  assert.equal(d.renderer, null);
  assert.equal(d.remote, null);
  assert.match(d.reasons.join(" "), /not provided in this release/);
});

test("with no native runtime React Native is never auto-rendered as web", () => {
  const d = select(makeEnv("linux"), rn);
  assert.equal(d.status, "needs-prerequisites");
  assert.equal(d.renderer, null);
});

test("a web build is rendered only when the user asks for it, and is labelled mobile web", () => {
  const d = select(makeEnv("linux"), rn, { target: "web" });
  assert.deepEqual([d.platform, d.framework, d.renderer.method, d.renderer.classification], ["mobile-web", "web", "browser-viewport", "mobile-web"]);
});

// ---- Mobile web and unknowns
test("mobile web keeps using the browser renderer on every OS", () => {
  for (const os of ["macos", "windows", "linux"]) {
    const d = select(makeEnv(os), null, { url: "https://example.test/" });
    assert.deepEqual([d.platform, d.renderer.method, d.renderer.location], ["mobile-web", "browser-viewport", "local"]);
  }
});

test("mobile web without Playwright asks before installing it", () => {
  const d = select(makeEnv("linux", { playwright: { found: false, version: null } }), null, { url: "https://example.test/" });
  assert.equal(d.status, "needs-prerequisites");
  assert.equal(d.missing[0].tool, "playwright");
});

test("an unidentifiable project asks what it is rather than guessing", () => {
  const d = select(makeEnv("linux"), { candidates: [] });
  assert.equal(d.status, "needs-input");
  assert.ok(d.questions[0].options.includes("react-native/react-native"));
});

test("several candidates ask which app to audit", () => {
  const d = select(makeEnv("macos", { xcrun: true }), { candidates: [...swiftui.candidates, ...uikit.candidates] });
  assert.equal(d.status, "needs-input");
  assert.deepEqual(d.questions[0].options, ["ios/swiftui", "ios/uikit"]);
});

test("a decision never lists a classification the method cannot support", () => {
  const scenarios = [
    select(makeEnv("macos", { "swiftui-render": found(), xcrun: true, adb: true }), swiftui),
    select(makeEnv("windows"), swiftui, {}, { remote: "declined" }),
    select(makeEnv("linux", { java: found("21.0.2"), adb: true }), compose({ composePreviews: 2 })),
    select(makeEnv("macos", { xcrun: true }), rn, { target: "ios" }),
  ];
  for (const d of scenarios) {
    for (const entry of [d.renderer, ...d.alternatives].filter(Boolean)) {
      if (entry.classification === "apple-swiftui") assert.notEqual(entry.method, "swiftopenui");
      if (entry.method === "swiftopenui") assert.equal(entry.genuine, false);
    }
  }
});

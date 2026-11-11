import assert from "node:assert/strict";
import test from "node:test";
import { detectEnvironment, javaMajor, macosMajor, normalizeOs } from "../src/environment.mjs";
import { detectProject } from "../src/project.mjs";
import { makeTree } from "./helpers.mjs";

function fakeProbe(table, calls = []) {
  return async (command, args) => {
    calls.push(command);
    const hit = table[command];
    if (!hit) return { ok: false, stdout: "", stderr: "not found" };
    return { ok: true, stdout: hit.stdout ?? "", stderr: hit.stderr ?? "" };
  };
}

test("operating systems are classified, and anything unexpected is unknown", () => {
  assert.equal(normalizeOs("darwin"), "macos");
  assert.equal(normalizeOs("win32"), "windows");
  assert.equal(normalizeOs("linux"), "linux");
  assert.equal(normalizeOs("freebsd"), "unknown");
  assert.equal(normalizeOs("aix"), "unknown");
});

test("macOS detection reads Apple tool versions and the macOS version", async () => {
  const env = await detectEnvironment({
    rawPlatform: "darwin", arch: "arm64",
    probe: fakeProbe({ xcodebuild: { stdout: "Xcode 16.2\nBuild version 16C5032a" }, xcrun: { stdout: "xcrun version 70." }, swift: { stdout: "Apple Swift version 6.0.3" }, "swiftui-render": { stdout: "usage" }, sw_vers: { stdout: "15.1\n" } }),
  });
  assert.equal(env.os, "macos");
  assert.deepEqual(env.tools.xcodebuild, { found: true, version: "16.2" });
  assert.equal(env.tools["swiftui-render"].found, true);
  assert.equal(env.macosVersion, "15.1");
  assert.equal(macosMajor(env), 15);
});

test("Windows and Linux never probe Apple tools and report them missing", async () => {
  for (const rawPlatform of ["win32", "linux"]) {
    const calls = [];
    const env = await detectEnvironment({ rawPlatform, probe: fakeProbe({ java: { stderr: 'openjdk version "21.0.2" 2024-01-16' } }, calls) });
    assert.equal(env.tools.xcodebuild.found, false);
    assert.equal(env.tools["swiftui-render"].found, false);
    assert.equal(env.macosVersion, null);
    assert.equal(calls.includes("xcodebuild"), false);
    assert.equal(calls.includes("sw_vers"), false);
    assert.equal(javaMajor(env.tools.java.version), 21);
  }
});

test("an unknown platform is reported as unknown without throwing", async () => {
  const env = await detectEnvironment({ rawPlatform: "sunos", probe: fakeProbe({}) });
  assert.equal(env.os, "unknown");
  assert.equal(env.tools.adb.found, false);
});

test("missing prerequisites are reported as not found with no version", async () => {
  const env = await detectEnvironment({ rawPlatform: "linux", probe: fakeProbe({}) });
  for (const name of ["java", "gradle", "adb", "node"]) assert.deepEqual(env.tools[name], { found: false, version: null });
});

test("java versions parse in both numbering schemes", () => {
  assert.equal(javaMajor("21.0.2"), 21);
  assert.equal(javaMajor("17.0.10"), 17);
  assert.equal(javaMajor("1.8.0_402"), 8);
  assert.equal(javaMajor(null), null);
});

const swiftui = "import SwiftUI\nstruct LoginView: View { var body: some View { Text(\"SECRET_SOURCE_MARKER\") } }\n";

test("a SwiftUI package is detected without copying any source text", async () => {
  const root = await makeTree({ "Package.swift": "// swift-tools-version: 5.9\n", "Sources/App/LoginView.swift": swiftui });
  const project = await detectProject(root);
  assert.deepEqual(project.candidates.map((c) => [c.platform, c.framework]), [["ios", "swiftui"]]);
  assert.equal(project.ios.hasPackageSwift, true);
  assert.equal(JSON.stringify(project).includes("SECRET_SOURCE_MARKER"), false, "detection output must not carry source text");
});

test("UIKit and mixed iOS projects are told apart and mixed asks for input", async () => {
  const uikit = await detectProject(await makeTree({ "App/Main.swift": "import UIKit\nclass A: UIViewController {}\n" }));
  assert.deepEqual(uikit.candidates.map((c) => c.framework), ["uikit"]);
  const mixed = await detectProject(await makeTree({ "A.swift": swiftui, "B.swift": "import UIKit\n" }));
  assert.deepEqual(mixed.candidates.map((c) => c.framework).sort(), ["swiftui", "uikit"]);
  assert.ok(mixed.notes.some((n) => /ask which screens/i.test(n)));
});

test("a Compose project reports versions, previews, and which screenshot tool it already uses", async () => {
  const root = await makeTree({
    "settings.gradle.kts": "include(\":app\")\n",
    "gradle/wrapper/gradle-wrapper.properties": "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.9-bin.zip\n",
    "gradle/libs.versions.toml": "[versions]\nkotlin = \"2.0.20\"\nagp = \"8.5.2\"\n",
    gradlew: "#!/bin/sh\n",
    "app/build.gradle.kts": "plugins { id(\"app.cash.paparazzi\") }\nandroid { buildFeatures { compose = true } }\n",
    "app/src/main/AndroidManifest.xml": "<manifest/>",
    "app/src/main/java/Home.kt": "@Preview\n@Composable\nfun HomePreview() {}\n@Preview\n@Composable\nfun Other() {}\n",
  });
  const project = await detectProject(root);
  assert.deepEqual(project.candidates.map((c) => c.framework), ["compose"]);
  assert.equal(project.android.gradleVersion, "8.9");
  assert.equal(project.android.kotlinVersion, "2.0.20");
  assert.equal(project.android.agpVersion, "8.5.2");
  assert.equal(project.android.composePreviews, 2);
  assert.equal(project.android.usesPaparazzi, true);
  assert.equal(project.android.usesMugshot, false);
  assert.equal(project.android.hasWrapper, true);
});

test("a View-based Android project is detected from layout resources", async () => {
  const project = await detectProject(await makeTree({ "settings.gradle": "", "app/build.gradle": "", "app/src/main/AndroidManifest.xml": "<manifest/>", "app/src/main/res/layout/main.xml": "<LinearLayout/>" }));
  assert.deepEqual(project.candidates.map((c) => c.framework), ["android-views"]);
});

test("React Native is one candidate, not three: its native shells are not separate apps", async () => {
  const project = await detectProject(await makeTree({
    "package.json": JSON.stringify({ dependencies: { "react-native": "0.76.1", expo: "52.0.0" } }),
    "ios/App/AppDelegate.swift": swiftui, "android/build.gradle": "", "android/app/src/main/AndroidManifest.xml": "<manifest/>",
  }));
  assert.deepEqual(project.candidates.map((c) => [c.platform, c.framework]), [["react-native", "react-native"]]);
  assert.equal(project.reactNative.expo, true);
  assert.equal(project.reactNative.hasIos, true);
  assert.equal(project.reactNative.hasAndroid, true);
});

test("dependency and build folders are not scanned", async () => {
  const project = await detectProject(await makeTree({ "node_modules/x/Thing.swift": swiftui, "Pods/Y/Other.swift": swiftui, "README.md": "# none" }));
  assert.deepEqual(project.candidates, []);
});

test("a missing directory is a clear error", async () => {
  await assert.rejects(() => detectProject("/definitely/not/here"), /not found/);
});

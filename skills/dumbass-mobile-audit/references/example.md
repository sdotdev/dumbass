# Worked example

Request: “Audit the mobile signup at a 390×844 CSS viewport. Evaluate navigation to signup, completing the form, recovering from a visible error, and confirming success.”

## What good handling decides up front

- **Viewport:** record 390×844 CSS pixels and the device scale factor in the manifest. A screenshot captured at scale 3 is 1170×2532 pixels, so state which coordinate space every tap uses.
- **Claims:** this is mobile web in an emulated viewport. Real keyboard behavior, native gestures, device performance and assistive technology are listed as untested, not implied.
- **Geometry:** a control's size may be given in CSS pixels only when the transform is known. Never convert screenshot pixels to millimeters.

## Frame record at device scale 3

Coordinates here are in CSS viewport units, so a tap at (195, 640) lands in the middle of the lower third regardless of how many pixels the screenshot has.

```json schema=frame
{
  "schema_version": "1.0.0",
  "run_id": "mobile-signup-1",
  "session_id": "novice",
  "frame_id": "novice-f3",
  "captured_at": "2026-11-10T12:00:20Z",
  "path": "sessions/novice/frames/novice-f3.png",
  "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
  "width": 1170,
  "height": 2532,
  "viewport": {
    "width": 390,
    "height": 844,
    "device_scale_factor": 3
  },
  "scroll": {
    "x": 0,
    "y": 0
  },
  "coordinate_space": "css-viewport",
  "redactions": []
}
```

The hash above is a placeholder. A real frame record carries the actual sha256 of the stored image. Follow [the audit protocol](audit-protocol.md) and the [mobile-web profile](../assets/profiles/mobile-web.json).

## Render manifest for a mixed session

One iOS screen rendered locally with `swiftui-render`, one that failed, and one imported approximation. The approximate entry is labelled as such and is withheld from evaluators unless the user approves it. The failed screen stays in the record with its reason, so the session is `incomplete` rather than quietly looking whole. The hashes are placeholders.

```json schema=render-manifest
{
  "schema_version": "1.0.0",
  "run_id": "demo-run",
  "session": {
    "status": "incomplete",
    "requested_screens": [
      "login",
      "settings",
      "onboarding"
    ],
    "reasons": [
      "settings: no usable screenshot (failed)",
      "ios-settings-failed: failed (TOOL_FAILED)"
    ]
  },
  "renders": [
    {
      "screenshot_id": "ios-login-light",
      "status": "captured",
      "platform": "ios",
      "framework": "swiftui",
      "renderer": {
        "name": "swiftui-render",
        "version": "0.2.0",
        "method": "swiftui-render",
        "classification": "apple-swiftui"
      },
      "execution": {
        "location": "local",
        "os": "macos",
        "toolchain": "Xcode 16.2"
      },
      "theme": "light",
      "ui_state": "default",
      "screen_id": "login",
      "captured_at": "2026-11-11T09:00:00Z",
      "revision": null,
      "source_project_id": "demo-app",
      "limitations": [
        "Renders on macOS, not on the iOS runtime, so iOS-only controls and system chrome can differ"
      ],
      "device": {
        "name": "iPhone preset (390x844 pt)",
        "width": 390,
        "height": 844,
        "pixel_width": 780,
        "pixel_height": 1688,
        "scale_factor": 2,
        "orientation": "portrait"
      },
      "file": {
        "path": "renders/screenshots/ios/ios-login-light.png",
        "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
        "media_type": "image/png"
      }
    },
    {
      "screenshot_id": "ios-settings-failed",
      "status": "failed",
      "platform": "ios",
      "framework": "swiftui",
      "renderer": {
        "name": "swiftui-render",
        "version": "0.2.0",
        "method": "swiftui-render",
        "classification": "apple-swiftui"
      },
      "execution": {
        "location": "local",
        "os": "macos",
        "toolchain": "Xcode 16.2"
      },
      "theme": "light",
      "ui_state": "default",
      "screen_id": "settings",
      "captured_at": "2026-11-11T09:00:00Z",
      "revision": null,
      "source_project_id": "demo-app",
      "limitations": [
        "Renders a standalone Swift file that defines a Preview view, not a running app"
      ],
      "failure": {
        "code": "TOOL_FAILED",
        "message": "swiftui-render could not compile the preview: unknown type 'AppState'"
      }
    },
    {
      "screenshot_id": "ios-onboarding-light",
      "status": "approximate",
      "platform": "ios",
      "framework": "swiftui",
      "renderer": {
        "name": "SwiftOpenUI",
        "version": "0.2.0",
        "method": "swiftopenui",
        "classification": "cross-platform-swift-compatible"
      },
      "execution": {
        "location": "local",
        "os": "linux",
        "toolchain": null
      },
      "theme": "light",
      "ui_state": "default",
      "screen_id": "onboarding",
      "captured_at": "2026-11-11T09:00:00Z",
      "revision": null,
      "source_project_id": "demo-app",
      "limitations": [
        "Not Apple's SwiftUI",
        "Has no iOS backend, so the image does not show iOS chrome"
      ],
      "device": {
        "name": "iPhone preset (390x844 pt)",
        "width": 390,
        "height": 844,
        "pixel_width": 780,
        "pixel_height": 1688,
        "scale_factor": 2,
        "orientation": "portrait"
      },
      "file": {
        "path": "renders/screenshots/ios/ios-onboarding-light.png",
        "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
        "media_type": "image/png"
      }
    }
  ]
}
```

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

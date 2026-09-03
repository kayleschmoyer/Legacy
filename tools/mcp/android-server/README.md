# android-server

> **Server ID:** `legacy-sports-android`

Android device/emulator/build tooling for agent-driven mobile work — the
Android counterpart to `legacy-sports-browser`'s dev-server/screenshot
lifecycle. Wraps `adb`, `emulator`, and the app's Gradle build so a mobile
ticket never has to hand-roll SDK PATH exports or boot-wait polling loops in
raw shell (LS-8815).

- **android_device** — `action: "list"` (wraps `adb devices`) | `"start_emulator"`
  (boots an AVD, blocks on `sys.boot_completed`, bounded per call — re-invoke
  to keep waiting) | `"reverse"` (wraps `adb reverse` for pointing a device at
  a local Metro dev server)
- **android_app** — `action: "install"` (wraps `adb install`) | `"launch"`
  (force-stops then wraps `adb shell am start`)
- **android_screenshot** — wraps `adb exec-out screencap -p`; returns the PNG
  inline, mirroring `browser_screenshot`'s evidence workflow
- **android_logcat** — filtered `adb logcat -d` crash triage (tag filter specs,
  optional buffer clear, line cap) instead of the full noisy buffer
- **android_build** — wraps `gradlew app:assemble<Variant>`, including a
  default `GITHUB_RUN_NUMBER`-shaped `versionCode` override so local
  reinstalls don't hit `INSTALL_FAILED_VERSION_DOWNGRADE`

## Reused logic

SDK-path resolution and `adb devices`/`emulator -list-avds` output parsing
are imported directly from `scripts/run-android-dev.mjs` (the `make app-dev`
cold-start wrapper) rather than reimplemented — those helpers already have
their own unit-test coverage in `scripts/__tests__/run-android-dev.test.mjs`.

## Availability

Local Windows/macOS/Linux dev machines with the Android SDK installed only.
No cloud agent environment in this repo (Copilot cloud, Claude Code Remote)
has an Android SDK, emulator, or connected device, so every tool here returns
a clear `AndroidEnvError` remedy — not a crash — when the SDK can't be found.
Verified emulator boot/build flows happen locally or via the `mobile-qa`
Maestro sweep, the same posture `run-android-dev.mjs` already documents for
its own untested boot path.

## Security

No child process is ever spawned through a shell except the Windows
`gradlew.bat` wrapper (execFile cannot launch a `.bat` shim without one — the
same class of issue as `make`/`pnpm` on Windows, see `make-server`). AVD names
are validated against `emulator -list-avds` before being passed to `spawn`
(whitelist check, mirroring `run-android-dev.mjs`).

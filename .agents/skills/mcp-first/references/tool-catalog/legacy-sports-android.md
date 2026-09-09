# Android MCP Tool Catalog

> GENERATED FILE — DO NOT EDIT.
>
> Source: `tools/mcp/android-server/src/{index,lambda}.ts`. Regenerate with 
> `make mcp-api-reference`; CI fails on drift (LS-9701 Tier 2, review pattern #48).
>
> For the interactive, filterable version of this same data across every
> server: [`docs/mcp/api-reference.html`](../../../../../docs/mcp/api-reference.html).

Android device/emulator connectivity, app install/launch, adb-backed screenshots, filtered logcat, and Gradle builds. Local-only — no SDK in any cloud agent environment.

Local stdio process only — not exposed as a hosted connector. 5 tools.

---

### `android_app`

Install or launch the app on a connected Android device/emulator. action="install" wraps `adb install`. action="launch" force-stops (default) then wraps `adb shell am start`. Call android_device({ action: "list" }) first to confirm a device is online.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `action` | enum | **required** | — | Which app operation to perform. |
| `apkPath` | string |  | — | action="install" only (required). Path to the .apk to install. |
| `reinstall` | boolean |  | — | action="install" only. Pass -r to adb install (keep app data). |
| `allowDowngrade` | boolean |  | — | action="install" only. Pass -d to allow a versionCode downgrade (avoids INSTALL_FAILED_VERSION_DOWNGRADE). |
| `package` | string |  | — | action="launch" only. Android application ID. |
| `activity` | string |  | — | action="launch" only. Activity to start. |
| `forceStop` | boolean |  | — | action="launch" only. Force-stop the app before starting it, clearing prior in-memory state. |
| `serial` | string |  | — | Target a specific device (adb -s). Defaults to the sole online device. |

### `android_build`

Build the Android app via Gradle (wraps `gradlew app:assembleDebug`/`app:assembleRelease`). Sets a fresh GITHUB_RUN_NUMBER-shaped versionCode automatically (current epoch seconds) so a local build reinstalling over a device with a newer CI build does not hit INSTALL_FAILED_VERSION_DOWNGRADE — pass versionCode to pin a specific value instead.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `variant` | enum |  | — | Gradle build variant. |
| `arch` | string |  | — | Restrict the native build to one ABI via -PreactNativeArchitectures, e.g. "x86_64" for a faster emulator-only build. |
| `versionCode` | number |  | integer, > 0 | Pin GITHUB_RUN_NUMBER (and therefore the Gradle versionCode) to this value instead of the auto-generated epoch-seconds default. |

### `android_device`

Android device/emulator connectivity. Resolves the SDK path itself (ANDROID_HOME/ANDROID_SDK_ROOT/default install dir) — never export PATH by hand. action="list" wraps `adb devices`. action="start_emulator" boots an AVD and blocks on sys.boot_completed (up to ~45s per call — re-call to keep waiting, it never spawns a second emulator while one is already booting); no-ops if a device is already connected. action="reverse" wraps `adb reverse` to point a device at a local Metro dev server.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `action` | enum |  | — | Which device operation to perform. |
| `avd` | string |  | — | action="start_emulator" only. AVD name to boot. Defaults to $ANDROID_AVD, then the only installed AVD. |
| `waitForBoot` | boolean |  | — | action="start_emulator" only. Block until sys.boot_completed=1 (bounded per call — see description). Pass false to just kick off the boot. |
| `timeoutMs` | number |  | integer, > 0 | action="start_emulator" only. Per-call boot-wait budget in ms (default 45000). Cold boot can take minutes — re-call to keep waiting. |
| `devicePort` | number |  | integer, > 0 | action="reverse" only. Port on the device to forward. |
| `hostPort` | number |  | integer, > 0 | action="reverse" only. Port on the host that devicePort forwards to, e.g. 8081 for Metro. |
| `serial` | string |  | — | Target a specific device (adb -s). Defaults to the sole online device. |

### `android_logcat`

Filtered `adb logcat` crash/debug triage — avoids dumping the full noisy buffer (mostly unrelated GMS/artd/ziparchive lines). Pass tags as `adb` filter specs (e.g. ["AndroidRuntime:E", "ReactNativeJS:*"]) — everything else is silenced (*:S appended automatically) unless a catch-all filter is already present.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `tags` | string[] |  | — | adb logcat filter specs, e.g. ["AndroidRuntime:E", "ReactNativeJS:*"]. Omit to dump the unfiltered buffer. |
| `sinceClear` | boolean |  | — | Clear the log buffer (adb logcat -c) before capturing, so only new lines are returned. |
| `maxLines` | number |  | integer, > 0 | Keep at most this many of the most recent lines. |
| `serial` | string |  | — | Target a specific device (adb -s). Defaults to the sole online device. |

### `android_screenshot`

Capture a screenshot of the connected device/emulator (wraps `adb exec-out screencap -p`) and return it inline — the mobile counterpart to browser_screenshot, for the visual before/after evidence the debugging and work-ticket skills require on mobile UI tickets. Saves to {repoRoot}/.screenshots/ unless outputPath is given.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `outputPath` | string |  | — | Absolute path to save the PNG to (default: repo .screenshots/ dir with a timestamped name). |
| `serial` | string |  | — | Target a specific device (adb -s). Defaults to the sole online device. |


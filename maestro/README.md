# Maestro Mobile E2E Flows

Maestro (https://maestro.mobile.dev) drives the Expo Android dev build (`apps/app`,
appId `com.legacysports.app`) on an emulator. Flows live under `flows/<page>/`,
organized by the same page slugs as the QA coverage mirror in
`docs/agents/qa-coverage/jira-page-epics/pages/`. Screenshots land in
`maestro/artifacts/` (gitignored) so the mobile QA agent can judge them for
visual bugs — see [`.agents/skills/mobile-qa/SKILL.md`](../.agents/skills/mobile-qa/SKILL.md).

## One-time setup

1. **Install Maestro** (needs Java 17+):
   - macOS/Linux: `curl -fsSL "https://get.maestro.mobile.dev" | bash`
   - Windows: install via WSL, or download the release zip from
     https://github.com/mobile-dev-inc/maestro/releases and add `maestro/bin` to `PATH`.
   - Verify: `maestro --version`
2. **Start an Android emulator** (any AVD; verify with `adb devices`).
3. **Build and install the dev APK** (from the repo root):

   ```bash
   # Auth bypass: authenticated flows expect the dev-login shortcut, which fakes a
   # signed-in LOCAL_USER and skips OAuth (see apps/app/src/common/auth/AuthHooks.ts).
   # Set it in apps/app/.env.local BEFORE prebuild:
   #   EXPO_PUBLIC_BYPASS_AUTH=true
   pnpm exec nx build-android-debug app
   adb install -r apps/app/android/app/build/outputs/apk/debug/app-debug.apk
   ```

## Fast JS-only iteration loop (dev client)

`apps/app` depends on `expo-dev-client` (debug builds only — see
[`.agents/skills/architecture/FILE-MAP.md`](../.agents/skills/architecture/FILE-MAP.md)
for where the Android wiring lives). A debug build installed once can reload
JS-only changes from a running Metro server without a native rebuild — useful
when iterating in a worktree. This is **not** the same as the Maestro flow
setup above (which builds/installs a fresh APK per sweep); it's for quick
manual verification of a JS change.

1. **Start Metro, with an explicit port.** `expo start` is non-interactive
   under an agent/CI shell and will silently _skip starting the dev server_
   if port 8081 is already taken — it prints a prompt
   (`Use port 8082 instead? › Skipping dev server`) that never resolves and
   exits without an error. Always pass `--port` explicitly (and free the port
   first if needed) so a stale server doesn't produce a confusing
   "works when I run it by hand, fails in automation" result:

   ```bash
   # from apps/app
   npx expo start --port 8081
   ```

2. **Forward the device to Metro:**

   ```bash
   adb reverse tcp:8081 tcp:8081
   ```

3. **Deep link into the dev client** (the app must already be installed —
   see step 3 under One-time setup):

   ```bash
   adb shell am start -a android.intent.action.VIEW \
     -d "legacysports://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" \
     com.legacysports.app
   ```

4. **Confirm it's genuinely running as a dev-client build, not the stale
   embedded bundle.** The deep link above does **not** error when
   `expo-dev-client` isn't present in the installed APK — it just launches
   the app normally and renders whatever JS was embedded at build time. A
   screenshot at that point can look like a successful verification while
   actually showing yesterday's build (this exact false positive shipped in
   LS-8790). Before trusting anything you see after the deep link, check for
   dev-launcher activity in logcat:

   ```bash
   adb logcat -d | grep -i "devlauncher\|devmenu"
   ```

   A dev-client build logs `DevLauncherController`/`DevMenu` activity around
   startup. If logcat shows nothing from those tags and the app just started
   `MainActivity` directly, the installed APK does not have `expo-dev-client`
   wired in (e.g. it's a release build, or was built before this dependency
   was added) — rebuild the debug variant before trusting the screen.

5. **Make a visible JS-only edit** (e.g. change a string in a screen already
   on screen) and confirm it appears **without** reinstalling the APK —
   Metro should show a bundle rebuild and the app should hot-reload.

## Running flows

From the repo root (screenshot paths are relative to the CWD — always run from root):

```bash
maestro test maestro/                                        # every flow
maestro test maestro/flows/trade-center/trade-center.yaml    # one flow
maestro test --include-tags=authenticated maestro/           # by tag
make maestro                                                 # Make wrapper (all flows)
```

## Tags

| Tag                                 | Meaning                                                               |
| ----------------------------------- | --------------------------------------------------------------------- |
| `authenticated`                     | Needs a build with `EXPO_PUBLIC_BYPASS_AUTH=true` (or a real session) |
| `unauthenticated`                   | Needs a build **without** the bypass (login screen must render)       |
| `<page-slug>` (e.g. `trade-center`) | The QA coverage page the flow exercises                               |

The login flow and the authenticated flows cannot run against the same APK in one
pass — the auth bypass hides the login screen. Run `--include-tags=authenticated`
against the bypass build (the common case) and the login flow against a plain build.

## Conventions

- **Selectors**: prefer `testID`s (`id:` in Maestro). The league-detail tab bar has
  no per-tab testIDs — tap those by visible text ("Roster", "Matchups", "Trades").
  Dynamic testIDs (e.g. `league-row-<id>`) are matched by regex + `index: 0`.
- **Screenshots**: every flow screenshots each meaningful state as
  `maestro/artifacts/<page>/NN-<state>`. Interactions capture _before/after_ pairs
  (`NN-before-<action>` / `NN-after-<action>`) so the AI judge can diff states.
- **Shared steps** live in `subflows/` (not matched by the workspace `flows` glob);
  include them with `runFlow: { file: ../../subflows/<name>.yaml }`.
- **Standalone-first**: every flow must pass under plain `maestro test` with no
  agent involvement — the QA agent only orchestrates runs and consumes artifacts.

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

---
name: mobile-qa
description: 'AI-assisted mobile QA sweeps of the Expo Android app: run Maestro flows on an emulator, capture screenshots, judge them for visual/functional bugs with the vision rubric, dedupe findings, and file Bugs under the QA coverage hierarchy. Load when: running /mobile-qa, authoring or editing flows under maestro/, working in scripts/mobile-qa/, or filing mobile QA findings to Jira.'
metadata:
  scope: 'maestro/**, scripts/mobile-qa/**, apps/app/**'
---

# Skill: Mobile QA (Maestro + AI Vision)

Drive the Android dev build of `apps/app` through the Maestro flows under `maestro/flows/`, screenshot every meaningful state, judge the screenshots for real-user-visible bugs, deduplicate the findings, and file the survivors as Bug tickets under the QA coverage hierarchy. This is the mobile counterpart of the web Playwright QA coverage (see [testing](../testing/SKILL.md) and the [QA coverage model](../plan-ticket/references/qa-coverage-model.md)); flows are organized by the same page slugs as `docs/agents/qa-coverage/jira-page-epics/pages/`.

## Critical preconditions

- **Before running any flow**, verify the harness end to end: `maestro --version` succeeds, `adb devices` lists a booted emulator, and the dev APK is installed (`adb shell pm list packages | grep com.legacysports.app`). Setup recipes: [maestro/README.md](../../../maestro/README.md).
- **Before running `authenticated`-tagged flows**, confirm the installed APK was built with `EXPO_PUBLIC_BYPASS_AUTH=true` in `apps/app/.env.local` (the dev-login shortcut in `apps/app/src/common/auth/AuthHooks.ts`). Mobile login is OAuth-only — there is no credential path Maestro can drive. The `login` flow conversely needs a build **without** the bypass.
- **Before filing findings to Jira**, run `auth_check_all` and follow the QA-coverage filing rules in [references/jira-filing.md](references/jira-filing.md) — Bugs parent to Feature Stories, never float free.
- **Before editing flows**, keep them standalone-runnable: every flow must pass under plain `maestro test maestro/flows/<page>/<flow>.yaml` with no agent involvement.

## Workflow

Transcribe these into TaskCreate entries at the start of a sweep:

1. **Preflight** — the harness checks above. If the emulator or APK is missing, surface the exact setup command from `maestro/README.md` and stop; building/booting can take longer than a session budget allows, so let the user decide.
2. **Run flows** — `maestro test --include-tags=authenticated maestro/` (or a single flow / page tag for a targeted sweep). Capture stdout; flow failures are themselves evidence, not a reason to abort the sweep.
3. **Judge screenshots** — for each flow step's screenshots under `maestro/artifacts/<page>/`, apply the rubric in [references/visual-judge.md](references/visual-judge.md). Two modes:
   - **In-context (default for agent sweeps)**: `Read` each screenshot (before/after pairs together) and judge it yourself against the rubric, emitting one findings JSON per step in the judge output shape into `maestro/artifacts/findings/`.
   - **Scripted (standalone/CI, or when the user asks for an external model)**: `node scripts/mobile-qa/judge.mjs --step <page/step> --screenshot <png> [--screenshot <png>] --out maestro/artifacts/findings/<page>-<NN>.json`. Claude is the default provider (`ANTHROPIC_API_KEY`; model override `ANTHROPIC_QA_MODEL`); `QA_AI_PROVIDER=openai-compatible` selects any OpenAI-compatible endpoint.
4. **Deduplicate** — `node scripts/mobile-qa/bug-filter.mjs --in maestro/artifacts/findings --out maestro/artifacts/report.json`. Three passes (fingerprint → Jaccard clustering → category+screen overlap); only `filable` entries (confidence ≥ 0.6) move on. Details: [references/jira-filing.md](references/jira-filing.md).
5. **File to Jira** — one ticket per `filable` entry via `jira_*` MCP tools, using the entry's ready-made `jiraDescription`, parented per the QA coverage hierarchy. Mirror each finding into `docs/agents/qa-coverage/jira-page-epics/pages/<page>/…/findings/`.
6. **Update coverage docs** — record the Maestro flow in the affected `feature.md` platform-coverage table (see the [QA coverage model](../plan-ticket/references/qa-coverage-model.md) § Platform coverage).
7. **Report** — summary table (flow → steps run → issues found → tickets filed) plus paths to `report.json` and the screenshots.

## Interaction pattern (ported interactor concept)

Web QA captured before/after DOM state around each interaction; the mobile equivalent lives **inside the flows**: each key interaction takes a `NN-before-<action>` / `NN-after-<action>` screenshot pair, and the judge receives both images for that step so it can detect no-op taps, stuck spinners, and broken transitions. When authoring a new flow, interact with each key element (tap, scroll, dialog step) and bracket every interaction with such a pair — see `maestro/flows/trade-center/trade-center.yaml` for the worked example.

## Flow-authoring gotchas

- Prefer `id:` selectors (React Native `testID`s — prevalent in `apps/app` and `lib/shared-components`). The league-detail tab bar has **no per-tab testIDs**: tap tabs by visible text ("Roster", "Matchups", "Trades").
- Dynamic testIDs (`league-row-<id>`) match by regex plus `index: 0`.
- Data-dependent states (matchups before season start, draft board without an active draft) belong inside `runFlow: { when: { visible: … } }` blocks or `optional: true` steps so flows degrade gracefully instead of failing.
- Shared steps live in `maestro/subflows/` (outside the workspace `flows` glob).
- Screenshot paths are CWD-relative — flows assume the repo root, writing to `maestro/artifacts/<page>/` (gitignored).

## Related skills

- [testing](../testing/SKILL.md) — the web test-type map this skill extends to Android.
- [ui-audit](../ui-audit/SKILL.md) — the web visual-audit sibling (browser MCP + in-app bug button); mobile findings file via `jira_*` tools instead because the mobile app has no bug-report proxy button.
- [plan-ticket](../plan-ticket/SKILL.md) — ticket archetypes; the QA coverage model reference is the filing contract.
- [dev-environment](../dev-environment/SKILL.md) — emulator/local-stack operation.

## Provenance and maintenance

- 2026-07-07: created with the initial Maestro workspace; judge/dedup logic ported from the external ai-qa-agent project (src/ai/judge.ts, src/agent/bugFilter.ts, src/agent/interactor.ts).
- Verify appId: `grep -n '"package"' apps/app/app.json`
- Verify auth bypass still exists: `grep -rn "EXPO_PUBLIC_BYPASS_AUTH" apps/app/src/common/auth/AuthHooks.ts`
- Verify flow inventory: `ls maestro/flows/*/`
- Verify script CLIs: `node scripts/mobile-qa/judge.mjs` and `node scripts/mobile-qa/bug-filter.mjs` (both print usage errors)

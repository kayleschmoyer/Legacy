# Feature Flags

Legacy Sports uses [GrowthBook](https://www.growthbook.io/) for runtime feature flags and A/B tests. This file is the single home for the flag inventory and the client-key delivery chain. Related homes (link, don't restate): env-var axes and registries → [`.agents/skills/config-and-flags/SKILL.md`](../.agents/skills/config-and-flags/SKILL.md); seeding flags in E2E tests → [`.agents/skills/testing/SKILL.md`](../.agents/skills/testing/SKILL.md); premium entitlements (a separate, non-GrowthBook axis) → [`.agents/skills/add-entitlement/SKILL.md`](../.agents/skills/add-entitlement/SKILL.md).

## How it works

- One SDK singleton per platform: web `apps/web/src/context/GrowthBookProvider.tsx` (exports `growthbook`, re-exports `useFeatureIsOn`/`useFeatureValue`), native `apps/app/src/app/_layout.tsx` (`createGrowthbook`).
- Both call `loadFeatures({ autoRefresh: true })` against `https://cdn.growthbook.io` **only when a client key is configured** (`env.growthbookClientKey` / `config.growthbookClientKey`). Empty or missing key → the fetch is skipped entirely, nothing breaks, and **every flag resolves to its in-code fallback**.
- With a key loaded, flag flips propagate on the SDK's auto-refresh cadence — no rebuild or redeploy.
- User targeting attributes: web `useGrowthBookAttributes(...)` (GrowthBookProvider.tsx), native `setAttributes` in `_layout.tsx` (id + subscriptionTier).

**Consequence to internalize:** the in-code fallback value is the effective production behavior whenever the key is absent (E2E builds, PR previews from the CI artifact, any build where the secret is empty). Choose fallbacks deliberately — see the asymmetry warning below.

## Client-key delivery chain

The key is a build-time inlined client var registered as `growthbookClientKey` in the app-config registry (`lib/app-config/src/lib/registry.ts`): web `VITE_GROWTHBOOK_CLIENT_KEY`, mobile `EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY`.

| Build                              | Env var                                  | Set by (verified 2026-07-02)                                                                                                                                             |
| ---------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web release                        | `VITE_GROWTHBOOK_CLIENT_KEY`             | `deploy-web.yml` "Build Web App" env, from the `GROWTHBOOK_CLIENT_KEY` repo secret (wired 2026-07-02 — previously unwired, so the flag service was inert in prod builds) |
| Android release                    | `EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY`      | `build-android-app.yml` job env, same neutral secret                                                                                                                     |
| PR preview (fallback build)        | `VITE_GROWTHBOOK_CLIENT_KEY`             | `deploy-pr-preview.yml` "Build Web App (Fallback)" env                                                                                                                   |
| PR preview (artifact rewrite path) | —                                        | Not set — the reused CI artifact has no key baked in; previews from this path run on flag fallbacks                                                                      |
| Hermetic E2E / PR CI               | —                                        | Intentionally unset; specs seed flags via `seedFeatureFlags` (see testing skill)                                                                                         |
| Local dev                          | root `.env` `VITE_GROWTHBOOK_CLIENT_KEY` | You; the mobile mirror is derived at prebuild — see next paragraph                                                                                                       |

**Mobile mirroring reality (not `app.config.js`):** since LS-7558/LS-7561, `app.config.js` only mirrors `APP_VERSION`. All `VITE_*` → `EXPO_PUBLIC_*` aliasing (GrowthBook, Rollbar, Giphy, commit SHA, build date, repo URL) happens in the `with-expo-public-env` prebuild plugin (`lib/app-config/plugins/with-expo-public-env.js`, alias table in `plugins/config-aliases.js`), which regenerates the gitignored `apps/app/.env` on every `expo prebuild` so Metro inlines the values. In CI the Android job env sets `EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY` directly, which always wins over aliasing.

The `GROWTHBOOK_CLIENT_KEY` repo secret value must be set by the repo owner (GrowthBook dashboard → SDK Connections → client key). Until it is set, release builds succeed and ship with the SDK disabled — fallbacks are the live behavior.

## Flag inventory (from code, 2026-07-02)

| Flag                               | Read via                      | Fallback when SDK off | Call sites                                                                                                                                                                     |
| ---------------------------------- | ----------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `football_enabled` (LS-4767)       | mixed — see warning below     | **mixed**             | Web: `app.tsx` `FootballGate`, `PlayerStatsPage.tsx`, `SportsDropdown.tsx`, `BaseballScreen.tsx`, `LeagueCreatePage.tsx`. Native: `(tabs)/players.tsx`, `football/players.tsx` |
| `football-mock-players` (LS-4666)  | `useFeatureIsOn`              | `false` (hidden)      | Web: `MockDraftPage.tsx` (`FOOTBALL_MOCK_PLAYERS_FLAG`). Native: `baseball/mock-draft.tsx`                                                                                     |
| `about-github-deeplinks` (LS-7741) | `useFeatureValue(..., true)`  | `true` (shown)        | Web: `AboutPage.tsx` — GitHub commit/repo deep links; disable in GrowthBook if the repo goes private                                                                           |
| `iap_revenue_breakdown_enabled`    | `useFeatureValue(..., false)` | `false` (hidden)      | Web: `AdminRevenuePage.tsx` — IAP revenue breakdown section                                                                                                                    |

Phantoms: `new-pricing-page` and `premium-cta-text` appear only as doc-comment examples in `GrowthBookProvider.tsx` — they exist nowhere else. Do not chase them when auditing flags.

Re-derive this table any time: `rg -n "useFeatureIsOn\(|useFeatureValue\(" apps lib --glob '*.tsx'`.

### `football_enabled` — asymmetric fallbacks (read before touching)

The call sites intentionally disagree on the fallback when GrowthBook is unloaded:

- **Fail-open** (`useFeatureValue('football_enabled', true)`): `app.tsx` `FootballGate` (redirects to `/` only when the flag is _explicitly_ `false`), `PlayerStatsPage.tsx`, and `LeagueCreatePage.tsx` (sport tab, since LS-9128/LS-9130 — see feature doc below). Rationale in the `FootballGate` doc comment: a `false` fallback would flash-redirect users while features are still loading and would break keyless E2E environments.
- **Fail-closed** (`useFeatureIsOn('football_enabled')` → `false`): `SportsDropdown.tsx` (top-nav entry), `BaseballScreen.tsx`, and both native players screens (sport switcher).

`LeagueCreatePage.tsx`'s sport tab used to be fail-closed, disagreeing with the `FootballGate` route guard it sits behind; LS-9128/LS-9130 switched it to the same fail-open fallback and to rendering the Football tab disabled-but-visible instead of removing it, so it no longer disagrees. See `docs/agents/qa-coverage/jira-page-epics/pages/create-league-football/features/feature-flag-gate/feature.md` for the full writeup.

Net effect with no key or flag off-at-source: football **navigation is hidden** everywhere, but `/football/*` routes remain **reachable by direct URL**. This is a deliberate soft gate, not a bug — the flag controls discoverability, not authorization (API resolvers, tables, and background jobs are intentionally never flag-gated). If you add a new `football_enabled` call site, pick the side consciously: nav/entry points fail closed; route gates and already-entered surfaces fail open.

## Adding a new flag — checklist

1. Create the feature in the GrowthBook dashboard (same key string you will use in code).
2. Read it via `useFeatureIsOn` (boolean, fallback `false`) or `useFeatureValue(key, fallback)` — import from `apps/web/src/context/GrowthBookProvider.tsx` on web, `@growthbook/growthbook-react` on native.
3. Choose the SDK-off fallback deliberately (fail-open vs fail-closed) and leave a one-line comment stating why.
4. E2E: any spec exercising the gated surface must seed the flag (`seedFeatureFlags` — the dominant historical CI-failure class is asserting on flag-gated UI without seeding; see the testing skill).
5. Add a row to the inventory table above.

## Maintenance

Rewritten 2026-07-02 from the repo-wide skills/config audit (scratch/skills-audit), which found the previous version's launch-lever and `app.config.js` claims stale. Re-verify volatile facts:

- Flag inventory: `rg -n "useFeatureIsOn\(|useFeatureValue\(" apps lib --glob '*.tsx'`
- CI key wiring: `rg -n "GROWTHBOOK" .github/workflows`
- Mobile aliasing: `rg -n "GROWTHBOOK" lib/app-config/plugins/config-aliases.js apps/app/app.config.js`
- Fallback asymmetry: `rg -n "football_enabled" apps/web/src`

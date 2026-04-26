# Remotion Video Application — `apps/video`

> **Jira:** [LS-3843](https://bkrupa.atlassian.net/browse/LS-3843)

## Overview

A self-contained Remotion (React-based video) app that produces a **60-second, 1920×1080 promotional/tutorial video** for Legacy Fantasy Baseball. It showcases the platform's core value proposition — cross-era MLB fantasy drafting — through a scripted sequence of animated scenes.

The video is entirely static (no runtime data fetching). All content is hard-coded for predictable rendering.

---

## Output

| Property             | Value                    |
| -------------------- | ------------------------ |
| Resolution           | 1920 × 1080 (Full HD)    |
| Frame rate           | 30 fps                   |
| Duration             | 1800 frames (60 seconds) |
| Default codec        | h264                     |
| Default image format | JPEG                     |

### Build scripts (`package.json`)

```bash
pnpm start          # Launch Remotion Studio (interactive preview)
pnpm render         # Export out/tutorial.mp4
pnpm render:gif     # Export out/tutorial.gif
pnpm build          # Same as render
```

---

## Composition

A single composition — **`TutorialVideo`** — is registered in [`src/Root.tsx`](src/Root.tsx) and sequenced in [`src/TutorialVideo.tsx`](src/TutorialVideo.tsx).

### Scene sequence

| #   | Scene              | Start | Duration     | File                                                            | Purpose                                                                            |
| --- | ------------------ | ----- | ------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | **TITLE**          | 0 s   | 4 s (120 f)  | [`TitleScene.tsx`](src/scenes/TitleScene.tsx)                   | Animated brand intro: "LEGACY FANTASY BASEBALL" title, tagline, and feature badges |
| 2   | **DIFFERENTIATOR** | 4 s   | 8 s (240 f)  | [`DifferentiatorScene.tsx`](src/scenes/DifferentiatorScene.tsx) | Two-column comparison: Normal Fantasy vs Legacy Fantasy                            |
| 3   | **CROSS_ERA**      | 12 s  | 8 s (240 f)  | [`CrossEraScene.tsx`](src/scenes/CrossEraScene.tsx)             | Four legendary player cards (1927–2019) with a historical timeline                 |
| 4   | **CREATE_LEAGUE**  | 20 s  | 11 s (330 f) | [`CreateLeagueScene.tsx`](src/scenes/CreateLeagueScene.tsx)     | Three-step league creation flow (Basic Settings → Era & History → Draft Settings)  |
| 5   | **DRAFT**          | 31 s  | 10 s (300 f) | [`DraftScene.tsx`](src/scenes/DraftScene.tsx)                   | Live draft simulation with pick log, timer, and player pool                        |
| 6   | **MATCHUP**        | 41 s  | 10 s (300 f) | [`MatchupScene.tsx`](src/scenes/MatchupScene.tsx)               | Weekly matchup scoreboard with team rosters and scoring                            |
| 7   | **CTA**            | 51 s  | 9 s (270 f)  | [`CTAScene.tsx`](src/scenes/CTAScene.tsx)                       | Finale: key stats, brand message, "Create Your League — It's Free" CTA             |

---

## Real app component cross-reference

Each video scene is a stylised, hard-coded approximation of a real screen in the web and/or mobile app. The table below maps each scene to the production component(s) it depicts.

### Scene 1 — TITLE (brand intro)

| Platform | File                                                       | Component             | Notes                                                            |
| -------- | ---------------------------------------------------------- | --------------------- | ---------------------------------------------------------------- |
| Web      | `apps/web/src/pages/landing/PublicLandingPage.tsx`         | `PublicLandingPage`   | Public-facing landing page with hero section and onboarding CTAs |
| Web      | `apps/web/src/components/baseball/BaseballLandingPage.tsx` | `BaseballLandingPage` | League dashboard entry point shown after sign-in                 |
| Mobile   | `apps/app/src/app/(app)/MLBHome.tsx`                       | `BaseballHome`        | Home screen for the MLB/baseball section                         |

### Scene 2 — DIFFERENTIATOR (Normal Fantasy vs Legacy Fantasy)

This scene is marketing copy only — there is no 1:1 screen in the app. The closest live surface is `PublicLandingPage` (`apps/web/src/pages/landing/PublicLandingPage.tsx`), which contains the value-prop messaging shown to unauthenticated visitors.

### Scene 3 — CROSS_ERA (historical player cards + timeline)

| Platform | File                                                                  | Component          | Notes                                                                                                                    |
| -------- | --------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Shared   | `lib/shared-components/src/features/elite-draft/PlayerCard.tsx`       | `PlayerCard`       | Primary player card used in the live draft — name, position (colour-coded), team, year, stats, draft/watch/queue actions |
| Shared   | `lib/shared-components/src/features/elite-draft/DraftPlayerBoard.tsx` | `DraftPlayerBoard` | Player pool grid with era/position filtering; the source of the available-players list shown in the video                |
| Shared   | `lib/shared-components/src/features/draft/PlayerCard.tsx`             | `PlayerCard`       | Tamagui-based variant used in roster/free-agent contexts (compact, roster, freeagent, draft variants)                    |

The video's standalone `src/components/PlayerCard.tsx` is a simplified, static replica for rendering purposes.

### Scene 4 — CREATE_LEAGUE (multi-step league creation)

| Platform | File                                                | Component          | Notes                                                                                                                   |
| -------- | --------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Web      | `apps/web/src/pages/baseball/LeagueCreatePage.tsx`  | `LeagueCreatePage` | Full multi-step form: Basic Settings → Era & History (eraFilter, hofOnly) → Draft Settings → Scheduling → Waiver config |
| Mobile   | `apps/app/src/app/(app)/baseball/league/create.tsx` | `LeagueCreatePage` | Mobile equivalent with the same multi-step flow                                                                         |

### Scene 5 — DRAFT (live draft board)

| Platform | File                                                                       | Component                      | Notes                                                                                                                  |
| -------- | -------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Shared   | `lib/shared-components/src/features/elite-draft/EliteDraftBoardScreen.tsx` | `EliteDraftBoardScreen`        | Core draft UI — countdown timer, available-player grid, pick log, team roster being built, real-time WebSocket updates |
| Shared   | `lib/shared-components/src/features/elite-draft/DraftPlayerBoard.tsx`      | `DraftPlayerBoard`             | Pluggable player board with six view modes (grid, list, compact, board, table, depth)                                  |
| Web      | `apps/web/src/components/EliteDraftBoard.tsx`                              | `EliteDraftBoardScreenWrapper` | Web wrapper that injects routing and passes props into `EliteDraftBoardScreen`                                         |
| Mobile   | `apps/app/src/app/(app)/DraftBoardPage.tsx`                                | `DraftBoardPage`               | Mobile entry point for the live draft                                                                                  |

### Scene 6 — MATCHUP (weekly matchup scoreboard)

| Platform | File                                                             | Component                 | Notes                                                                                                     |
| -------- | ---------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| Web      | `apps/web/src/pages/matchup/MatchupDetailPage.tsx`               | `MatchupDetailPage`       | Full matchup breakdown — scoreboard, games remaining, roster comparison, win probability, week navigation |
| Web      | `apps/web/src/features/matchup/MatchupScoreboard.tsx`            | `MatchupScoreboard`       | Computed team scores, projected totals, and player-level scoring breakdown                                |
| Web      | `apps/web/src/features/matchup/MatchupRosterComparison.tsx`      | `MatchupRosterComparison` | Side-by-side roster display with per-player stats and game status                                         |
| Mobile   | `apps/app/src/features/matchup/screens/MatchupDetailScreen.tsx`  | `MatchupDetailScreen`     | Mobile matchup view with Overview/Standings tabs, scoreboard, games remaining, and roster comparison      |
| Mobile   | `apps/app/src/features/matchup/components/MatchupScoreboard.tsx` | `MatchupScoreboard`       | Mobile scoring display component                                                                          |

### Scene 7 — CTA

Marketing/promotional content only — no direct app equivalent.

---

## Key files

| File                                                             | Role                                                                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`src/index.ts`](src/index.ts)                                   | Entry point — registers the Root component with Remotion                                                          |
| [`src/Root.tsx`](src/Root.tsx)                                   | Registers the `TutorialVideo` composition (dimensions, fps, duration)                                             |
| [`src/TutorialVideo.tsx`](src/TutorialVideo.tsx)                 | Top-level sequence — assembles all scenes using `<Sequence>` blocks with explicit `from`/`durationInFrames` props |
| [`src/theme.ts`](src/theme.ts)                                   | Shared design tokens: color palette, typography scale, easing curves, spring configs                              |
| [`src/components/PlayerCard.tsx`](src/components/PlayerCard.tsx) | Reusable player card — name, year, team, position, stats array, optional highlight                                |
| [`src/scenes/`](src/scenes/)                                     | One file per scene (see table above)                                                                              |
| [`remotion.config.ts`](remotion.config.ts)                       | Remotion config — codec, image format, overwrite flag                                                             |

---

## Design system

Defined in [`src/theme.ts`](src/theme.ts) and consistent with the repo-wide design system:

- **Fonts**: Big Shoulders Display (headings/display), Literata (body/UI), Roboto Mono (data/mono)
- **Color palette**
  - Backgrounds: `#0A0F1A` → `#0D1526` → `#111B2F` → `#16223A`
  - Heritage gold `#C5A55A` — wins, highlights, CTAs
  - Seam red `#C41E3A` — alerts, losing states
  - Deep navy `#1B3A5C` — primary interactive
- **Animation**: spring-based entrance/exit effects; `easeOutQuart` / `easeInOutQuart` easing curves; timing from Remotion's `useCurrentFrame` / `interpolate`

---

## Dependencies

The app is self-contained — it does **not** import from any `lib/` packages.

| Package                  | Purpose                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `remotion`               | Core Remotion primitives (`<AbsoluteFill>`, `<Sequence>`, `interpolate`, `spring`, etc.) |
| `@remotion/cli`          | Studio dev server and render CLI                                                         |
| `@remotion/google-fonts` | Font loading (`loadFont`)                                                                |
| React / React-DOM        | Component runtime                                                                        |

---

## Message & content

**Core value proposition**: draft any MLB player from 150 years of history — 1927 Babe Ruth against 2019 Mike Trout — in a league scored on actual archived box scores, with no dependency on live games.

**Key differentiators highlighted in video**:

- Cross-era player drafting (historical statistics, not projections)
- No live-game dependency — play at your own pace
- 50,000+ player seasons available
- Scored on real MLB historical data

**Call-to-action**: `legacy.sports` — "Create Your League — It's Free"

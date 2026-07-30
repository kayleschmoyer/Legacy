# Handoff: Players Tab — Card Feed Redesign (option 1c)

## Overview
Redesign of the Android app's **Players tab** (`apps/app/src/app/(app)/(tabs)/players.tsx`) replacing the current Stats/Compare segmented control + sport pills + desktop-scale stats shell with a mobile-first **card feed**: a compact branded header, sport toggle, always-visible search, a position chip rail in the canonical position colors, FPTS-first player cards with trend indicators, and an inline premium teaser.

This corresponds to option **1c** in `Players Tab.dc.html` (this bundle includes a copy).

## About the Design Files
The files in this bundle are **design references created in HTML** — interactive prototypes showing intended look and behavior, **not production code**. The task is to recreate this design inside the existing `bkrupa/legacy-sports` React Native (Tamagui) codebase using its established patterns:

- Colors from `@legacy-sports/design-tokens` (`lib/design-tokens/src/lib/colors.ts`) — never re-declare hex literals; every value below already exists there or in `lib/shared-components/src/utils/colors.ts`.
- Position badge colors via `getPositionColor(sport, position)` / `baseballPositionBadges` / `footballPositionBadges`.
- Type system from the stats shell (`lib/shared-components/src/features/players/shell/tokens.ts`): `FONT_DISPLAY`, `FONT_BODY`, `FONT_MONO`.
- Existing `PositionBadge` component (`lib/shared-components/src/components/PositionBadge.tsx`) where it fits.
- Screen wiring stays in `apps/app/src/app/(app)/(tabs)/players.tsx`; data comes from the existing career-stats services (`CareerStatsService`, `useCareerStatsWithNames`) and the football equivalents.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and radii below are final and drawn from the repo's own token set. Recreate pixel-perfectly with Tamagui primitives (`YStack`/`XStack`/`Text`) + the design-token constants.

## Screen: Players (Card Feed)

Dark theme shown (the stats surfaces are dark-chrome in both app themes; a light variant using the `lightSurface`/`lightText` tokens and the AA gold override `#B8942B` is shown as option 1f in the design file).

Page background: `colors.dark.surface.bg` = `#0A0F1A`. Body font: Literata (serif).

### Layout (top → bottom)
Screen padding: 16px horizontal. Header block gap: 10px.

1. **Title row** — flex row, space-between, align center
   - "Players": Big Shoulders Display 800, 26px, `#FFFFFF`
   - **Sport toggle** (right): pill container `background:#111B2F` (surfacePanel), `border:1px solid #1E2D45` (STATS_BORDER), `border-radius:9999px`, `padding:3px`. Two segments "MLB" / "NFL": `padding:5px 12px`, radius 9999. Active: `background:#1B3A5C` (brand navy), text `#FFFFFF`. Inactive: transparent, text `#9CAAC5` (fg3). Label: Big Shoulders Display 700, 11px, letter-spacing 0.96px.
2. **Search field** — `background:#111B2F`, `border:1px solid #1E2D45`, `border-radius:10px`, `min-height:44px`, padding `0 12px 0 38px`. Leading search icon 16px stroke `#9CAAC5` absolute left 12. Input: Literata 14px, text `#F8FAFC`, placeholder `#6C80BA` (fg4), placeholder copy "Search players". Live filtering (no Apply button — see Behavior).
3. **Position chip rail** — horizontal scroll, gap 6px, no scrollbar. Chips: `padding:7px 13px`, `border-radius:9999px`, `border:1px solid`, label Big Shoulders Display 700 11px, letter-spacing 0.8px.
   - Baseball set: ALL, C, 1B, 2B, 3B, SS, OF, DH, SP, RP. Football set: ALL, QB, RB, WR, TE (extend with K/DST per `footballPositionBadges`).
   - Inactive: border `#2F3B53` (outlineDefault), transparent bg, text `#9CAAC5`.
   - Active ALL: border `#C5A55A` (brand gold), bg `rgba(197,165,90,0.14)`, text `#D4BB78` (goldLight).
   - Active position chip: border = that position's badge color from `baseballPositionBadges`/`footballPositionBadges`; bg `rgba(255,255,255,0.06)`; text = a lightened variant of the position color for AA on dark (prototype values in the design file's `PCT` map — acceptable to compute with an oklch lighten instead).
4. **Result meta row** — space-between: "{n} players" 12px `#6C80BA`; **sort control** right: `padding:6px 12px`, radius 8, `border:1px solid rgba(197,165,90,0.4)`, `background:rgba(197,165,90,0.08)`, label "FPTS ▼/▲" Big Shoulders Display 700 11px uppercase `#D4BB78`. Tap toggles direction.
5. **Card list** — vertical stack, gap 8px, bottom padding 24px.

### Player card
Container: `background:#111B2F`, `border:1px solid #1E2D45`, `border-radius:12px`, `padding:12px`, flex row, gap 12px, align center. Min tap target 44px (card is ~62px tall). Pressed state: Tamagui `pressStyle={{ opacity: 0.85 }}`.

- **Position tile** (left): 38×38, `border-radius:9px`, `border:1px solid <positionColor>`, `background:rgba(255,255,255,0.05)`. Label: position abbreviation, Big Shoulders Display 800, 11px, letter-spacing 0.8px, color = lightened position color (same map as chips).
- **Identity** (middle, flex 1, min-width 0):
  - Name: Literata 600, 15px, `#F5F7FA` (TEXT_HIGH_CONTRAST), single line ellipsis.
  - Sub-stats: JetBrains Mono 11.5px, `#9CAAC5`, margin-top 2px.
    - Baseball: `HR 762 · RBI 1,996 · AVG .298`
    - Football: `BUF · YDS 4,587 · TD 42`
- **Score block** (right, column, align end, gap 2px):
  - FPTS value: JetBrains Mono 700, 16px, `#F5F7FA`, thousands separators.
  - Trend line: 11px — `▲ FPTS` in `#6FD39A` (semantic.successFg), `▼ FPTS` in `#E07A8C` (dangerFg-adjacent, matches SCORE_LOSS), `— FPTS` in `#6C80BA` for flat.

### Premium teaser card (free tier only)
Inserted once in the feed (after ~3rd card or at end). `border:1.5px dashed rgba(197,165,90,0.5)`, `border-radius:12px`, `padding:14px`, `background:rgba(197,165,90,0.05)`.
- Title "GO PREMIUM": Big Shoulders Display 700, 12px, letter-spacing 0.96px, uppercase, `#D4BB78`.
- Copy: Literata 12.5px `#9CAAC5`: "Unlock FPTS/G, oWAR, custom columns and 500-row pages."
- Trailing "→" Big Shoulders Display 800 18px `#D4BB78`.
- Hidden entirely for premium users (`useSubscription().isPremium`); gate the tap through the existing `PremiumGate`/subscription flow.

### Bottom tab bar
Unchanged from `apps/app/src/app/(app)/(tabs)/_layout.tsx` (expo-router Tabs, lucide icons, `palette.text.fg1` active / `fg3` inactive, `surface.bg` background, `panelBorder` top border, 11px labels).

## Interactions & Behavior
- **Sport toggle**: switching sport resets position chip to ALL and clears search (mirrors the current `sportKey` remount contract in `players.tsx` that clears sport-specific filter state). Data source switches between baseball career stats and football stats.
- **Search**: live, debounced ~300ms (reuse the grid's debounce pattern), server-side `searchTerm`; keep the existing 2-char minimum before querying (`enforceSearchMinLength`). No Apply button anywhere on this screen.
- **Position chips**: single-select; selecting queries with `position` param (same values the toolbar select used). ALL clears it.
- **Sort control**: toggles FPTS asc/desc (`orderBy: 'totalScore'` per `COLUMN_TO_SORT_FIELD_MAP.fantasyPoints`). Persist sort + filters to expo-router params using the same one-way-hydration pattern as the current screen's `buildStatsParams`/`parseStatsParams` round-trip in `apps/app/src/app/(app)/PlayerStats.tsx` — a parallel `buildCardFeedParams`/`parseCardFeedParams` pair in `players.tsx`, since that pair's field set (view/pageSize/team/minHomeRuns/...) doesn't cover this screen's position/searchTerm/sortDir — so links/backgrounding restore state.
- **Card tap**: navigate to PlayerDetail via the existing `toPlayerDetailIdParam` guard + `router.push({ pathname: '/PlayerDetail', ... })`.
- **Infinite scroll** replaces the pagination panel: fetch next page (cursor `after`) when the list nears its end; keep page size 25.
- **Compare**: no longer a top-level segment. Reach it from PlayerDetail or a header overflow action (design decision recorded in option 1c; if a segment must stay, see option 1b's underline tabs).
- **Loading**: skeleton cards (same geometry as player card, shimmer bars `rgba(255,255,255,0.08)`), 8 rows.
- **Empty**: reuse the shell `EmptyCard` copy ("No players found…") with a "Clear all filters" navy pill button (`#1B3A5C`, radius 9999, uppercase Big Shoulders Display 12px white).
- **Error**: reuse `ErrorCard` pattern (seam-red border `#C41E3A`, Retry navy pill).

## State Management
- `sport: 'baseball' | 'football'` (gate football behind the existing `football_enabled` GrowthBook flag)
- `position: string` (default 'ALL'), `searchTerm: string`, `sortDir: 'asc' | 'desc'` (default desc)
- Applied state mirrored to expo-router search params (shareable / restore-on-kill), matching the current wrapper's one-way hydration
- Data: existing `useCareerStatsWithNames` (baseball) + football stats hook; `isPremium` from `useSubscription`
- Rostered/availability data (`rosteredPlayerIds`) is available if you add an availability filter later (see option 1d)

## Design Tokens (all pre-existing in the repo)
Colors (dark): bg `#0A0F1A` · panel `#111B2F` · card `#16223A` · STATS_BORDER `#1E2D45` · outlineSubtle `#1C2740` · outlineDefault `#2F3B53` · panelBorder `#1F2D48` · fg1 `#F8FAFC` · high-contrast `#F5F7FA` · fg3 `#9CAAC5` · fg4 `#6C80BA` · navy `#1B3A5C` · navyLight `#2C4A7C` · gold `#C5A55A` · goldLight `#D4BB78` · seamRed `#C41E3A` · successFg `#6FD39A` · loss `#E07A8C`.
Position badges: P/SP `#4A708B`, RP `#2E7D6E`, C `#C41E3A`, 1B `#B5651D`, 2B `#C5A55A`, 3B `#2D6A4F`, SS `#2C4A7C`, OF `#64748B`, DH `#8B2635`; QB `#C41E3A`, RB `#8B6F47`, WR `#2D6A4F`, TE `#7C8794`, K `#C5A55A`.
Typography: Big Shoulders Display 700/800 (display/labels, uppercase + tracking), Literata 400/600 (body/names), JetBrains Mono 400–700 (stats). Sizes used: 26 title / 15 name / 14 input / 12.5 body / 11–12 labels / 16 FPTS / 11.5 mono sub.
Spacing: 16 screen gutter · 12 card padding · 10 header gap · 8 list gap · 6 chip gap.
Radii: 12 cards · 10 search · 9 position tile · 9999 pills/chips · 8 sort control.

## Assets
No image assets. Icons: search = lucide `Search` (already used); tab bar icons unchanged (lucide via `@tamagui/lucide-icons`). Position tiles and chips are pure color/typography.

## Files
- `Players Tab.dc.html` — interactive design doc; **option 1c is the spec for this handoff** (option 1f = light-theme variant; 1a = faithful recreation of the current screen for before/after reference).
- `android-frame.jsx` — device-frame scaffolding used by the prototype (presentation only, ignore for implementation).

Sample data in the prototype (career leaders, 2025 NFL stats) is illustrative only.

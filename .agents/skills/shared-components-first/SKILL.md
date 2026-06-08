---
name: shared-components-first
description: 'Cross-platform UI principle: build shared Tamagui components in lib/shared-components, consumed by both apps/web and apps/app via viewport-responsive props. Load when building or reviewing UI for web or native.'
---

# Skill: Shared-Components-First, Viewport-Responsive UI

## The Rule

**Build UI once in `lib/shared-components` (Tamagui). Both `apps/web` and `apps/app` consume it. Adapt layout by viewport size, not by platform.**

Never write a UI screen in `apps/web` or `apps/app` that the other platform will also need. If a screen or feature exists (or will exist) on both platforms, it belongs in `lib/shared-components`.

## When to Extract

Extract to shared-components when:

- A screen or feature appears in both web and native (home, matchup detail, standings, roster, notifications, etc.)
- A component already exists on one platform and is being added to the other
- You are asked to build a new screen for either platform

App-specific code is acceptable only for:

- Navigation wrappers (stack/tab navigators are platform-specific)
- Platform-specific API glue (push notification registration, deep link handling, camera)
- Thin data-fetching wrappers that pass resolved props down into shared components

## How Cross-Platform Works

### Tamagui as the shared primitive layer

All shared UI uses Tamagui primitives (`XStack`, `YStack`, `Text`, `Card`, `ScrollView`, etc.). Tamagui compiles to `react-native-web` on web and React Native on mobile — the same JSX renders correctly on both platforms without conditional branching.

### AppProvider web/native split

`AppProvider` (exported from `@legacy-sports/shared-components/ui`) wires up Tamagui's theme and config. Each platform supplies its own `AppProvider` entry so theme tokens resolve correctly.

### Package entry points

`lib/shared-components` exposes scoped sub-path exports rather than one flat barrel:

| Import path                                      | Contents                                       |
| ------------------------------------------------ | ---------------------------------------------- |
| `@legacy-sports/shared-components/ui`            | Primitives, layout, common UI components       |
| `@legacy-sports/shared-components/matchup`       | Matchup detail, scoreboard hero, trade banners |
| `@legacy-sports/shared-components/leagues`       | League detail, standings, scoring summary      |
| `@legacy-sports/shared-components/roster`        | Roster board, week navigation, status banners  |
| `@legacy-sports/shared-components/players`       | Player stats, player comparison, career stats  |
| `@legacy-sports/shared-components/notifications` | NotificationsScreen                            |
| `@legacy-sports/shared-components/stats`         | Stats table, filters, sort controls            |
| `@legacy-sports/shared-components/football`      | NFL-specific home and player detail            |
| `@legacy-sports/shared-components/baseball`      | MLB-specific home                              |
| `@legacy-sports/shared-components/auth`          | Auth providers, OAuth flows                    |
| `@legacy-sports/shared-components/season-draft`  | Season draft join, sport chrome                |
| `@legacy-sports/shared-components/elite-draft`   | Elite draft room                               |

Entry point source files live at `lib/shared-components/src/entry/*.ts`.

### Platform-specific resolution

For components with genuinely different implementations per platform, use the magic-string system:

- `lib/shared-components/src/platform-components/web/` — web implementations
- `lib/shared-components/src/platform-components/mobile/` — native implementations
- `__PLATFORM_COMPONENTS__` resolves at build time to the correct directory

For simple utilities: Metro's `.native.ts` extension pattern (no config needed).

See `docs/architecture/cross-platform-system.md` for the full resolution rules.

## Responsive Patterns

### 1. Tamagui media props (preferred for layout)

Tamagui media tokens apply inline style overrides at defined breakpoints. Use them directly in JSX:

```tsx
<XStack
  flexDirection="row"
  $sm={{ flexDirection: 'column' }}   // stacks at ≤640px
  gap="$4"
  $gtMd={{ gap: '$6' }}               // wider gap above 1024px
>
```

Common tokens (defined in the Tamagui config):

- `$sm` — applies at **≤640px**
- `$gtSm` — applies at **>640px**
- `$md` — applies at **≤768px**
- `$gtMd` — applies at **>1024px**
- `$lg` / `$gtLg` — applies at ≤/> 1280px

**Real example** (`MatchupScoreboardView.tsx`):

```tsx
const ScoreRow = tamaguiStyled(XStack, {
  flexWrap: 'wrap',
  gap: '$2',
  $sm: { paddingHorizontal: '$3', paddingVertical: '$2' },
});
```

### 2. `useMedia()` hook (for conditional rendering)

When you need to conditionally render JSX (not just restyle it), use Tamagui's `useMedia`:

```tsx
import { useMedia } from 'tamagui';

function MyComponent() {
  const media = useMedia();
  return media.gtMd ? <TwoColumnLayout /> : <SingleColumnLayout />;
}
```

### 3. `useIsNarrow()` / `window.matchMedia` (for custom breakpoints)

`MinigamesHub.tsx` defines a local `useIsNarrow` hook for a custom 720px breakpoint, with an `isNarrow` prop override so native callers can pass `useWindowDimensions` instead:

```tsx
// Narrow-viewport detection — pass isNarrow prop from native callers.
const NARROW_QUERY = '(max-width: 720px)';
function useIsNarrow(): boolean {
  /* window.matchMedia listener */
}

export function MinigamesHub({ isNarrow: isNarrowProp }: MinigamesHubProps) {
  const detectedNarrow = useIsNarrow();
  const isNarrow = isNarrowProp ?? detectedNarrow;
  // ...
}
```

### 4. `isWeb` guard (last resort)

Tamagui exports `isWeb: boolean` for one-off platform divergences. Use sparingly — prefer media props for layout differences.

```tsx
import { isWeb } from 'tamagui';
const fontFamily = isWeb ? 'Big Shoulders Display, system-ui' : undefined;
```

## Anti-Patterns

### ❌ Bespoke per-platform screens

```
apps/web/src/pages/home/HomePage.tsx   ← web-only dashboard, 400 lines
apps/app/src/app/(app)/(tabs)/home.tsx ← native-only duplicate
lib/shared-components/src/features/home/HomeScreen.tsx ← orphaned, 0 consumers
```

This is three divergent homes. The shared version should be the only source of truth.

### ❌ Copy-pasting JSX between apps

If you find yourself copying layout code from `apps/web` to `apps/app` (or vice versa), stop — extract to shared-components instead.

### ❌ Orphaned shared components

A component in `lib/shared-components` that nothing consumes is waste. If you create a shared component, wire both platforms up to consume it before closing the PR.

### ❌ Destroying breakpoints during extraction

PR titles like "Kill X web fork — adopt shared version" are a danger signal. Always audit the web original for media props and responsive blocks before replacing it. Run this diagnostic:

```bash
grep -cE '\$sm:|\$md:|\$gtSm|useMedia' <original-web-file>
```

If the count is non-zero, every responsive token must be preserved in the shared version. If the shared version has fewer responsive tokens than the web original, responsiveness was lost.

## Diagnostic: Was Responsiveness Lost?

```bash
# Count responsive tokens in the shared component
grep -cE '\$sm:|\$md:|\$gtSm:|useMedia' lib/shared-components/src/features/<feature>/<Component>.tsx

# Compare against the web original (before extraction)
grep -cE '\$sm:|\$md:|\$gtSm:|useMedia' apps/web/src/pages/<feature>/<Component>.tsx
```

If shared < original, the extraction dropped responsive behavior — treat this as a bug (example: LS-7799, LS-7819).

## Worked Example: Home Screen Unification (LS-7791, PR #4937)

**Before**: Three divergent implementations — `apps/web/src/pages/home/HomePage.tsx` (web-only), `lib/shared-components/src/features/home/HomeScreen.tsx` (orphaned), `apps/app/src/app/(app)/(tabs)/home.tsx` (native sport-picker only).

**After** (PR #4937): A single `HomeScreen` component in `lib/shared-components/src/features/home/` with:

- `isWeb` guard for display fonts
- `$sm`/responsive layout via Tamagui tokens
- Thin wrappers in `apps/web` and `apps/app` that only supply navigation callbacks and data

This is the canonical pattern: shared component owns all layout and visual logic; app wrappers own only platform-specific concerns (routing, data fetching, navigation callbacks).

## Checklist Before Opening a UI PR

- [ ] Is the component in `lib/shared-components`? (not duplicated in both apps)
- [ ] Does both `apps/web` and `apps/app` consume it?
- [ ] Does it use Tamagui media props / `useMedia` for responsive layout?
- [ ] Did you run `grep -cE '\$sm:|\$md:|\$gtSm:|useMedia'` to verify no responsive tokens were dropped?
- [ ] Is it exported from the correct entry point in `lib/shared-components/src/entry/`?
- [ ] Did `make pc` pass (including the stricter shared-components lint rules)?

## Related

- `docs/architecture/shared-components.md` — architecture overview and entry point mechanism
- `docs/architecture/cross-platform-system.md` — platform resolution (magic strings, `.native.ts`)
- `.agents/skills/promote-shared-components/SKILL.md` — step-by-step promotion checklist
- `.agents/skills/ui/SKILL.md` — brand/design tokens and visual patterns

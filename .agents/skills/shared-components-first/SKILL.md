---
name: shared-components-first
description: 'Cross-platform UI principle: build platform-agnostic Tamagui components in lib/shared-components, consumed by both apps/web and apps/app, adapting by viewport breakpoint — never by platform. Load when building or reviewing any UI (web, native, or shared).'
metadata:
  scope: 'apps/web/**, apps/app/**, lib/shared-components/**'
---

# Skill: Shared-Components-First, Viewport-Responsive UI

## The Rule

**Build UI once in `lib/shared-components` (Tamagui). Both `apps/web` and `apps/app` consume it. Adapt layout by viewport size, not by platform.**

Never write a UI screen in `apps/web` or `apps/app` that the other platform will also need. If a screen or feature exists (or will exist) on both platforms, it belongs in `lib/shared-components`.

### Components are platform-agnostic; only the viewport width varies

A shared component must render correctly on **any** platform at **any** width. There is no "web layout" and no "native layout" — there are only breakpoints. A phone is a narrow viewport; a desktop browser window dragged narrow is the _same_ narrow viewport and must get the same layout.

The decision test for any conditional in shared UI:

> **"Would this differ between a narrow desktop window and a wide tablet?"**
>
> - Varies with **width** → it is a breakpoint concern. Use Tamagui media props / `useMedia`. Never `isWeb` / `Platform.OS`.
> - Varies only with the **runtime** (a native-only API, font loading mechanics, DOM-only CSS like `backdrop-filter`) → a platform branch is permitted, but it must never change layout, spacing, visibility, or component structure.

`isWeb ? <DesktopLayout/> : <MobileLayout/>` is always wrong: it gives mobile-web users a broken desktop layout and tablet users a cramped phone layout. The same UI decision expressed as `media.gtMd ? <TwoCol/> : <OneCol/>` is correct on every device.

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

### Platform-specific resolution (rare — capability shims only)

Platform-specific implementations exist for **capability gaps** (a DOM API vs a native module), never for layout or visual differences. If the two implementations would differ only in layout, they are one component with breakpoints. When genuinely needed, use the magic-string system:

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

### 4. `isWeb` guard (last resort — capability shims only)

Tamagui exports `isWeb: boolean` for one-off platform divergences. It is permitted **only** for runtime capability gaps — font-family resolution, DOM-only CSS, native-only APIs — never for layout, spacing, visibility, or choosing between component structures. Apply the decision test from [The Rule](#the-rule) before writing one.

```tsx
import { isWeb } from 'tamagui';
// OK: font resolution mechanics differ per runtime; layout is unchanged
const fontFamily = isWeb ? 'Big Shoulders Display, system-ui' : undefined;
```

> The codebase contains legacy `isWeb`/`Platform.OS` layout branches that predate this rule. **Do not pattern-match on them** — they are migration debt, not precedent. New code must use breakpoints; if you touch a file with a platform-conditional layout branch, prefer converting it to media props while you're there (or ticket it if out of scope).

## Anti-Patterns

### ❌ Platform checks driving layout

```tsx
// WRONG — mobile web gets the "desktop" layout; tablets get the phone layout
import { isWeb } from 'tamagui';
return isWeb ? <SideBySidePanels /> : <StackedPanels />;

// WRONG — same mistake with React Native's Platform module
import { Platform } from 'react-native';
const columns = Platform.OS === 'web' ? 3 : 1;

// RIGHT — the viewport width decides, identically on every platform
const media = useMedia();
return media.gtMd ? <SideBySidePanels /> : <StackedPanels />;
```

The platform never determines layout. A native tablet has a wide viewport; a mobile browser has a narrow one. Only breakpoints handle both correctly.

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
- [ ] Zero new `isWeb` / `Platform.OS` / platform-components branches that affect layout, spacing, visibility, or structure? (Capability shims only — run `git diff | grep -E 'isWeb|Platform\.OS'` and justify every hit)
- [ ] Did you run `grep -cE '\$sm:|\$md:|\$gtSm:|useMedia'` to verify no responsive tokens were dropped?
- [ ] Is it exported from the correct entry point in `lib/shared-components/src/entry/`?
- [ ] Did `make pc` pass (including the stricter shared-components lint rules)?

## Related

- `docs/architecture/shared-components.md` — architecture overview and entry point mechanism
- `docs/architecture/cross-platform-system.md` — platform resolution (magic strings, `.native.ts`)
- `.agents/skills/promote-shared-components/SKILL.md` — step-by-step promotion checklist
- `.agents/skills/ui/SKILL.md` — brand/design tokens and visual patterns

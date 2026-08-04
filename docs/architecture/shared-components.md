# Shared-Components Architecture

## Overview

`lib/shared-components` is the **single source of truth for UI** in the Legacy Sports monorepo. Every screen or feature that appears on both web and native is built once as a cross-platform [Tamagui](https://tamagui.dev/) component here, then consumed by `apps/web` (via `react-native-web`) and `apps/app` (React Native) through typed package exports.

The rule: **build UI once, adapt by viewport size — not by platform.**

Components are platform-agnostic. A shared component renders correctly on any platform at any width: a phone is a narrow viewport, and a desktop browser window dragged narrow is the _same_ narrow viewport with the same layout. There is no "web version" or "native version" of a screen — only breakpoints. Platform branches (`isWeb`, `Platform.OS`, `platform-components/`) exist solely for runtime **capability gaps** (native-only APIs, DOM-only CSS, font loading mechanics) and must never change layout, spacing, visibility, or component structure.

## Motivation: The Home Screen Drift

Before the LS-7791 unification, the home screen existed in three divergent forms:

1. **`apps/web/src/pages/home/HomePage.tsx`** — a bespoke, web-only dashboard with 13+ responsive breakpoint blocks.
2. **`lib/shared-components/src/features/home/HomeScreen.tsx`** — a shared Tamagui component that nothing consumed (orphaned).
3. **`apps/app/src/app/(app)/(tabs)/home.tsx`** — a native-only sport-picker with zero sharing.

This pattern recurred across the codebase: MLBHome (LS-7799), MatchupCard (LS-7709), NotificationsScreen (LS-7801). Each time an agent built "the web version" without checking whether a shared version existed, a new divergence was created. The cost: repeated extraction work, lost responsive tokens, and visual inconsistency.

PR #4937 (LS-7791) unified the three homes into a single `HomeScreen` in `lib/shared-components`. It is now the canonical example of the principle in practice.

## Layering

```
apps/web                   apps/app
    │                          │
    └──────────┬───────────────┘
               │  consumes via typed package exports
               ▼
   lib/shared-components
   └── src/features/<feature>/<Component>.tsx   ← all layout & visual logic
   └── src/entry/<feature>.ts                   ← public entry point
               │
               ▼  Tamagui primitives
   XStack, YStack, Text, Card, ScrollView, ...
               │
               ▼  platform compilation
   react-native-web (web)   React Native (mobile)
```

App code provides only:

- Navigation callbacks (router-specific: `useRouter` on web, `useNavigation` on native)
- Data fetching (each platform may use its own GraphQL hooks or pass resolved props)
- Platform-specific shell (tab bar, stack navigator, deep-link entry)

Shared-components provides:

- All layout decisions
- All visual styling (colors, typography, spacing)
- All responsive behavior

## Entry Point Mechanism

Consumers import from scoped sub-path exports rather than a flat barrel. Each entry point is a file at `lib/shared-components/src/entry/<name>.ts` that re-exports from the feature directory.

```typescript
// Entry point file: lib/shared-components/src/entry/roster.ts
export * from '../features/roster';
```

The `exports` field in `lib/shared-components/package.json` maps these to the published sub-paths:

```typescript
// apps/web (or apps/app)
import { RosterBoard } from '@legacy-sports/shared-components/roster';
import { MatchupDetailLayout } from '@legacy-sports/shared-components/matchup';
import { HomeScreen } from '@legacy-sports/shared-components'; // default barrel
```

Available entry points:

| Sub-path         | Feature                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `/ui`            | Primitives, layout, common UI (Button, Table, ErrorBoundary, etc.) |
| `/matchup`       | Matchup detail, scoreboard hero, trade banners                     |
| `/leagues`       | League detail shell, standings, scoring summary                    |
| `/roster`        | Roster board, week navigation, status banners                      |
| `/players`       | Player stats, comparison, career stats                             |
| `/notifications` | NotificationsScreen                                                |
| `/stats`         | Stats tables, filters, sort                                        |
| `/football`      | NFL home, player detail                                            |
| `/baseball`      | MLB home                                                           |
| `/auth`          | OAuth providers, auth flows                                        |
| `/season-draft`  | Season draft join                                                  |
| `/elite-draft`   | Elite draft room                                                   |

## Responsive Strategy

Tamagui's responsive system is the correct tool for layout adaptation. **Never use CSS `@media` queries** — they are web-only and produce no effect on React Native.

### 1. Inline media props (preferred)

Tamagui supports inline media-query overrides directly on any primitive:

```tsx
<XStack
  flexDirection="row"
  $sm={{ flexDirection: 'column' }}   // ≤640px: stack vertically
  gap="$4"
  $gtMd={{ gap: '$6' }}               // >1024px: wider gap
>
```

Common tokens (defined in the project Tamagui config):

- `$sm` — ≤640px
- `$gtSm` — >640px
- `$md` — ≤768px
- `$gtMd` — >1024px

### 2. `useMedia()` hook (conditional rendering)

```tsx
import { useMedia } from 'tamagui';

const media = useMedia();
return media.gtMd ? <TwoColLayout /> : <OneColLayout />;
```

### 3. `useIsNarrow()` / `window.matchMedia` (custom breakpoints)

For non-standard breakpoints, components define a local `useIsNarrow` hook plus an `isNarrow` prop override so native callers can supply `useWindowDimensions` instead of a DOM API:

```tsx
// MinigamesHub.tsx pattern
const NARROW_QUERY = '(max-width: 720px)';
function useIsNarrow(): boolean {
  /* window.matchMedia listener */
}

export function MinigamesHub({ isNarrow: isNarrowProp }: MinigamesHubProps) {
  const detected = useIsNarrow();
  const isNarrow = isNarrowProp ?? detected;
}
```

### 4. `isWeb` guard (last resort — capability shims only)

```tsx
import { isWeb } from 'tamagui';
const fontFamily = isWeb ? 'Big Shoulders Display, system-ui' : undefined;
```

Permitted only for unavoidable runtime divergences (CSS `backdrop-filter`, display font resolution, native-only APIs). Never for layout: `isWeb ? <DesktopLayout/> : <MobileLayout/>` breaks mobile web (gets the desktop layout) and tablets (get the phone layout). The decision test: _would this differ between a narrow desktop window and a wide tablet?_ If it varies with width, it's a breakpoint, not a platform branch.

## Platform-Specific Resolution

When a component has genuinely different implementations per platform, use one of two patterns (described fully in `docs/architecture/cross-platform-system.md`):

**Magic-string system** (complex UI components):

```
lib/shared-components/src/platform-components/web/   ← web implementation
lib/shared-components/src/platform-components/mobile/ ← native implementation
```

`__PLATFORM_COMPONENTS__` resolves to the correct directory at build time.

**Metro native resolution** (simple utilities):

- `lib/utils/src/lib/Foo.ts` — web/server version
- `lib/utils/src/lib/Foo.native.ts` — native version (Metro auto-selects)

## When App-Specific Code Is Acceptable

Not every file belongs in shared-components. App-specific code is appropriate for:

| Acceptable in `apps/*`         | Reason                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Stack/tab/drawer navigators    | Expo Router / React Navigation are platform-specific APIs                              |
| Deep-link entry routes         | Platform URL scheme handling                                                           |
| Push-notification registration | `expo-notifications` is native-only                                                    |
| OAuth redirect handlers        | Web uses `next-auth`; native uses Expo `AuthSession`                                   |
| Thin data-fetching wrappers    | OK to keep GraphQL hooks in the app if they pass resolved props into shared components |

The test: _"Will the other platform need this UI?"_ If yes, it belongs in shared-components.

## Anti-Patterns

| Pattern                                                               | Problem                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Building a web screen without checking `lib/shared-components`        | Creates a divergence that costs a future extraction ticket                                                         |
| Orphaning a shared component (creating but not wiring both platforms) | Waste; the next agent won't know it exists                                                                         |
| Copy-pasting JSX from `apps/web` to `apps/app`                        | The canonical sign that extraction was needed                                                                      |
| `isWeb` / `Platform.OS` branch that changes layout or visibility      | Breaks mobile web and tablets; the viewport width, not the platform, decides layout — use media props / `useMedia` |
| Dropping `$sm`/`$gtMd` blocks during extraction                       | Loses responsive layout on web; creates the LS-7799/LS-7819 class of bug                                           |

## Related

- `docs/architecture/cross-platform-system.md` — magic-string and `.native.ts` resolution
- `docs/architecture/mobile-navigation.md` — native tab-bar and navigator structure
- `.agents/skills/shared-components-first/SKILL.md` — agent checklist and diagnostic commands
- `.agents/skills/promote-shared-components/SKILL.md` — step-by-step extraction process

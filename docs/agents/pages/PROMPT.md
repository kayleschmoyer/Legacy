# Page Design Prompt — Legacy Sports Web App

> Load this file before implementing or significantly revising any page in `apps/web/src/pages/`. It defines all mandatory conventions, quality gates, and design constraints.

---

## Mandatory Pre-Work

Before writing a single line of code, read:

1. **`/.impeccable.md`** — full design brief (brand, typography, color, motion, navigation philosophy). Every decision you make must be traceable back to a principle there.
2. **The page's reference doc** in this directory (e.g., `home.md`, `scoreboard.md`). It defines the exact data model, conditional rendering rules, and route.
3. **`apps/web/src/constants/colors.ts`** — never hard-code hex values; always import named constants (`BRAND_GOLD`, `BG_DARK`, etc.).

---

## File & Component Conventions

### File structure

```
apps/web/src/pages/<section>/<PageName>Page.tsx   ← page component
apps/web/src/pages/<section>/index.ts             ← re-export (if needed by lazy loader)
```

- **All page files are `.tsx`** — never `.ts`, `.js`, or `.jsx`.
- One default export per file — the page component.
- Named exports are allowed for sub-components defined in the same file, but prefer extracting them to `apps/web/src/features/<section>/` if they grow beyond ~80 lines.

### Component signature

```tsx
// Correct — default export, functional component
export default function LeagueDetailPage() { ... }

// Also acceptable for lazy-loaded pages with named re-exports
export function PlayerStatsPage() { ... }
export default PlayerStatsPage;
```

- **No class components.**
- **No `React.FC<Props>` wrapper** — type props inline or with a local interface.

---

## SPA Route Integration

Every new page **must** be wired into `apps/web/src/app/app.tsx` before the task is considered complete.

### Pattern — lazy-loaded route

```tsx
// 1. Add lazy import near the top of app.tsx (alphabetical within the block)
const MyNewPage = lazyWithRetry(() => import('../pages/section/MyNewPage'));

// 2. Add <Route> inside the <Routes> tree
<Route path="/my-path" element={<MyNewPage />} />

// Nested route example
<Route path="/baseball/league/:leagueId">
  <Route index element={<LeagueDetailPage />} />
  <Route path="matchup/:matchupId" element={<MatchupDetailPage />} />
</Route>
```

- **Always use `lazyWithRetry`** (from `../utils/lazyWithRetry`) — never bare `React.lazy()`.
- **Never use `<a href>` for internal navigation** — always `useNavigate()` or `<Link to>` from `react-router-dom`.
- Route params are typed via `useParams<{ leagueId: string }>()`.

---

## UI Component Library

**Source of truth**: `@legacy-sports/shared-components/ui` and `tamagui`.

### Prefer these over raw HTML

| Intent                | Component                                                      |
| --------------------- | -------------------------------------------------------------- |
| Vertical stack        | `<YStack>`                                                     |
| Horizontal stack      | `<XStack>`                                                     |
| Heading levels        | `<H1>` `<H2>` `<H3>` (from shared-components/ui)               |
| Body text             | `<Paragraph>`                                                  |
| Button                | `<Button>`                                                     |
| Scroll container      | `<ScrollView>` from tamagui                                    |
| Loading state         | `<Spinner>` from tamagui                                       |
| Custom styled element | `styled(View, { ... })` — never inline `style={{}}` for layout |

### Never use raw HTML layout elements (`<div>`, `<section>`, `<main>`) in page components. Use Tamagui primitives.

### Tamagui `styled()` for component variants

```tsx
const LeagueCard = styled(YStack, {
  backgroundColor: '$color2',
  borderRadius: '$3',
  padding: '$4',
  variants: {
    highlighted: {
      true: { borderColor: BRAND_GOLD, borderWidth: 1 },
    },
  },
});
```

---

## Typography Rules

| Use case                | Font                      | Weight  | Component                               |
| ----------------------- | ------------------------- | ------- | --------------------------------------- |
| Page / section title    | Big Shoulders Display     | 700–800 | `<H1>` / `<H2>`                         |
| Card heading            | Big Shoulders Display     | 600     | `<H3>`                                  |
| Body copy, descriptions | Literata                  | 400     | `<Paragraph>`                           |
| Stat values             | tabular, Literata or mono | 700     | `<Text fontVariant={['tabular-nums']}>` |
| Stat labels             | Literata                  | 400     | `<Text fontSize="$2" color="$color10">` |

- **Never use Inter, Playfair Display, Syne, or any font not in this table.**
- Stat columns must align on the decimal — use `fontVariant={['tabular-nums']}` on every numeric cell.
- Body copy width: never exceed `70ch`.

---

## Color Rules

Always import from `apps/web/src/constants/colors.ts`. Never write raw hex strings.

```tsx
import {
  BG_DARK, // #0A0F1A  — page canvas
  BG_LIGHT, // #16223A  — elevated card
  BRAND_GOLD, // #C5A55A  — wins, trophies, match results
  BRAND_SEAM_RED, // #C41E3A — alerts, losing states
  BRAND_NAVY, // #1B3A5C  — interactive elements
  withAlpha,
} from '../../constants/colors';
```

### Accent color rules (non-negotiable)

- `BRAND_GOLD` — wins, first place, draft picks, positive outcomes only.
- `BRAND_SEAM_RED` — errors, losing, critical alerts only.
- `BRAND_NAVY` — buttons, selected states, primary CTAs only.
- **Never use cyan, purple, or neon.** No gradient text (`background-clip: text`).
- **No `border-left`/`border-right` accent stripes wider than `1px`** — use background tints, full borders, or leading icons instead.

---

## Mobile Responsiveness (Required)

This app is **mobile-first**. Every page must be fully functional and visually correct at 375px wide (iPhone SE) and at 1280px+ (desktop).

### Responsive patterns

```tsx
// Stack direction that flips at breakpoint
<XStack flexWrap="wrap" gap="$4">
  <YStack flex={1} minWidth={280}>...</YStack>
  <YStack flex={1} minWidth={280}>...</YStack>
</XStack>

// Hide on small screens
<XStack display="none" $gtMd={{ display: 'flex' }}>
  ...desktop-only content...
</XStack>

// Show only on small screens
<YStack display="flex" $gtMd={{ display: 'none' }}>
  ...mobile-only content...
</YStack>
```

- Tamagui breakpoints: `$sm` (640), `$md` (768), `$lg` (1024), `$xl` (1280).
- Touch targets: all interactive elements minimum **44×44px** (`minWidth={44} minHeight={44}`).
- Navigation components (dropdowns, modals) must slide up from bottom on mobile, not appear inline.
- Tables on mobile: prefer `ScrollView horizontal` + fixed first column over collapsing columns.

---

## Required State Handling

Every data-fetching page must handle all four states. Do not ship a page with any state missing.

```tsx
// Loading
if (loading && !data) return <FullPageSpinner />; // large gold Spinner, centered

// Error
if (error) return <ErrorCard title="Unable to load" onRetry={refetch} />;

// Empty
if (!items.length) return <EmptyState message="No leagues yet" />;

// Success — render content
```

- Skeleton screens are preferred over spinners for content-heavy pages (league lists, stats tables).
- Skeletons must match the **actual layout** — not generic gray rectangles.

---

## GraphQL Conventions

- **Always use `.graphql` files + codegen** for new queries and fragments, not inline `gql` tagged templates.
- Place `.graphql` files in `apps/web/src/api/db/` alongside the generated hooks.
- Import generated hooks: `import { useGetLeagueQuery } from '../../api/db/graphql.generated'`.
- Use `fetchPolicy: 'cache-and-network'` for pages that need live data.
- Use `fetchPolicy: 'cache-first'` for static/reference data (player bios, team info).

---

## Motion & Transitions

Every route change must have **directional meaning**. Implement via the app's existing transition wrapper — do not roll custom CSS transitions on individual pages.

| Navigation type   | Animation                                             |
| ----------------- | ----------------------------------------------------- |
| Drill into detail | Slide in from right + slight scale-up                 |
| Navigate back     | Slide out to left                                     |
| Tab switch        | Crossfade (parallel, not hierarchical)                |
| Modal / sheet     | Slide up from bottom (mobile); fade + scale (desktop) |

- Timing: **280–320ms ease-out-quart** for navigation; **120–150ms** for micro-interactions.
- **Animate `transform` and `opacity` only** — never `width`, `height`, `padding`, or `margin`.
- Always add `@media (prefers-reduced-motion: reduce)` fallback: crossfades only, no positional movement.

---

## PageMeta

Every page must include `<PageMeta>` as the first child of its root element.

```tsx
import { PageMeta } from '../../components/PageMeta';

export default function LeagueDetailPage() {
  return (
    <YStack flex={1}>
      <PageMeta title="League — Legacy Sports" />
      ...
    </YStack>
  );
}
```

---

## Anti-Patterns Checklist

Before opening a PR, verify none of these appear in your diff:

- [ ] Raw `<div>`/`<section>` used for layout instead of `YStack`/`XStack`
- [ ] Hardcoded hex color strings (anything not from `constants/colors.ts`)
- [ ] Bare `React.lazy()` instead of `lazyWithRetry`
- [ ] Page not wired into `app.tsx` `<Routes>`
- [ ] `<a href>` for internal navigation instead of `<Link>` / `useNavigate`
- [ ] Missing loading state
- [ ] Missing error state
- [ ] Missing empty state
- [ ] Touch targets under 44×44px
- [ ] `border-left` or `border-right` accent stripe wider than 1px
- [ ] Gradient text (`background-clip: text` with gradient)
- [ ] Cyan, purple, or neon accent colors
- [ ] `console.*` calls (use `LOGGER` from `@legacy-sports/logging`)
- [ ] `@ts-ignore` or `eslint-disable` comments
- [ ] Inline `gql` template for a new query (use `.graphql` file + codegen)
- [ ] Non-tabular numerics in a stats column
- [ ] Font not in the approved list (Big Shoulders Display, Literata)
- [ ] `prefers-reduced-motion` not respected in animated components
- [ ] Page file is `.ts` / `.js` / `.jsx` instead of `.tsx`

---

## Self-Review Gate

Run `/review` (or the steps in `.agents/skills/pr-lifecycle/references/self-review.md`) after `make pc` passes and **before** pushing. Read every changed file in full. Fix anything that matches a pattern above.

# @legacy-sports/design-tokens

Raw design-token values — colors, spacing, radii, shadows, typography, breakpoints — as plain
TypeScript objects, plus a `tokens.css` custom-property sheet.

```ts
import { spacing, breakpoints, colors } from '@legacy-sports/design-tokens';
```

```ts
import '@legacy-sports/design-tokens/tokens.css';
```

## What this package is for

**Raw numbers in non-Tamagui contexts.** Web-only CSS, canvas drawing, native measurement
math, build-time tooling — anywhere you need the value itself rather than a themed style prop.

`lib/tamagui-config` layers `spacing` and `radii` into Tamagui's `tokens.space` / `tokens.radius`
scales (LS-9014), so `$4` in JSX and `spacing[4]` here resolve to the same 16px. Colors are
wired directly into the `brandDark` / `brandLight` themes.

## What this package is NOT for

**Do not use `breakpoints` to reason about what `$sm` / `$md` do in JSX.** Tamagui media props
compile against `@tamagui/config`'s own `media` export, not this file, and the two disagree:

| Token | This package | Tamagui (what `$token` actually fires at) |
| ----- | ------------ | ----------------------------------------- |
| `xxs` | 0            | ≤390                                      |
| `xs`  | 660          | ≤660 ✅                                   |
| `sm`  | 800          | ≤800 ✅                                   |
| `md`  | 860          | **≤1020**                                 |
| `lg`  | 980          | **≤1280**                                 |
| `xl`  | 1120         | **≤1650**                                 |
| `xxl` | 1280         | **no such token**                         |

Two consequences worth knowing before you write a media prop:

- Writing `$xxl={{ … }}` in JSX compiles, typechecks, lints, and does nothing.
- `$md` fires 160px later than this file implies. Layout written against 860 will not reflow
  where you expect.

The comment in `src/lib/breakpoints.ts` claiming these mirror the Tamagui defaults is
inaccurate for `md`/`lg`/`xl`/`xxl`. Reconciling the values is deliberately deferred —
consumers may depend on the current numbers, so re-pointing them is a layout change needing
its own validation. Tracked in LS-9416.

**For media props, use the tier table in
[`.agents/skills/ui/references/responsive-density.md`](../../.agents/skills/ui/references/responsive-density.md).**
That page is also where the density ladder and the 44px touch-target rule live.

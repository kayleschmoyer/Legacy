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

**`breakpoints` values are band LOWER bounds — a Tamagui `$X` media key is a `maxWidth`.** As of
LS-9885 `lib/tamagui-config` derives Tamagui's `media` config from this file, so the two finally
describe the same scale, but they still bracket a band from opposite ends:

| Band  | Lower bound here | What `$X` fires at in JSX   |
| ----- | ---------------- | --------------------------- |
| `xxs` | 0                | ≤ 659                       |
| `xs`  | 660              | ≤ 799                       |
| `sm`  | 800              | ≤ 859                       |
| `md`  | 860              | ≤ 979                       |
| `lg`  | 980              | ≤ 1119                      |
| `xl`  | 1120             | ≤ 1279                      |
| `xxl` | 1280             | ≥ 1280 (top band, minWidth) |

A `$X` key matches its own band _and everything narrower_ — the mobile-first cascade — so it ends
one pixel below the next band's lower bound. That also makes `$X` and `$gtX` exact complements,
which is why `mediaQueries` here uses the next band's lower bound for each `gt` query.

**The alignment is landing in slices** (LS-9895 → LS-9896/9897/9898). Until they all land, the
`md`, `xs` and `sm` rows above describe the target, not today's runtime. The Status column in
[`responsive-density.md`](../../.agents/skills/ui/references/responsive-density.md) is the live
state.

**History.** LS-9416 audited this drift and chose to keep the two as separate vocabularies
(option (c)), removing `xxl`/`gtXl` because no `@tamagui/config` counterpart existed — `$xxl={{ … }}`
compiled, linted, and did nothing. LS-9885 reversed that premise by giving the workspace its own
`media` config, so `xxl`/`gtXl` are back and are now real. (`--bp-xxl` had never left `tokens.css`,
so this also re-syncs the TS scale with the CSS one.)

**For media props, use the tier table in
[`.agents/skills/ui/references/responsive-density.md`](../../.agents/skills/ui/references/responsive-density.md).**
That page is also where the density ladder and the 44px touch-target rule live.

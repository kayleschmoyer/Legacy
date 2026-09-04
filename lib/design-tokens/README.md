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

`md`/`lg`/`xl` fire at different widths than this file implies — e.g. `$md` fires 160px later
than the number above suggests, so layout written against 860 will not reflow where you expect.

**LS-9416 resolution:** this package's band scale and Tamagui's `media` config are two
deliberately separate vocabularies (option (c) from that ticket — see its comments for the
consumer audit). `breakpoints`/`mediaQueries` stay the source for raw numbers in non-Tamagui
contexts; they are not renamed, since `src/lib/breakpoints.ts` and this README already say
outright that they don't govern `$token` behavior. What did change: the `xxl` band and the
`gtXxs` / `gtXl` media queries were removed. Neither has a real `@tamagui/config` counterpart
(no `xxl` media key exists at all, and Tamagui has no `gtXxs` — its first `gt*` query is
`gtXs`), so keeping them was a silent no-op trap: `$xxl={{ … }}` compiled, typechecked, linted,
and did nothing. An audit of `breakpoints`/`mediaQueries` consumers (`grep -rn
"breakpoints\.\|mediaQueries\." lib apps`, recorded on LS-9416) found no code depending on
either, only tests. The comment in `src/lib/breakpoints.ts` previously claimed these values
mirror the Tamagui defaults; it's corrected to say they're an independent scale.

**For media props, use the tier table in
[`.agents/skills/ui/references/responsive-density.md`](../../.agents/skills/ui/references/responsive-density.md).**
That page is also where the density ladder and the 44px touch-target rule live.

// Band lower bounds (px) for the design system's viewport vocabulary. Each
// value is the *lower* bound of its named band, so band N spans
// `[breakpoints[N], breakpoints[next] - 1]` and `xxs` starts at 0:
//
//   xxs 0–659 | xs 660–799 | sm 800–859 | md 860–979
//   lg 980–1119 | xl 1120–1279 | xxl 1280+
//
// This is the scale the design mocks are annotated against, and — as of
// LS-9885 — the scale `lib/tamagui-config` derives Tamagui's `media` config
// from, so a `$md` style prop in JSX and `breakpoints.md` here finally
// describe the same widths. Note the bracket direction differs between the
// two: values here are lower bounds, while a Tamagui `$X` media key is a
// `maxWidth` (it matches its own band *and everything narrower*, the usual
// mobile-first cascade). `lib/tamagui-config` owns that conversion; see
// `buildDesignTokenMedia()` there.
//
// Use this file for raw numbers in non-Tamagui contexts (web-only CSS,
// canvas, native measurement). For which style prop to reach for in JSX, see
// `.agents/skills/ui/references/responsive-density.md`.
//
// History: LS-9416 audited a drift between this scale and `@tamagui/config`'s
// stock `media` values and deliberately kept them as two separate
// vocabularies, removing `xxl`/`gtXl` because no Tamagui counterpart existed.
// LS-9885 reversed that premise by making Tamagui's `media` derive from this
// file, so `xxl`/`gtXl` are back and are now real.
export const breakpoints = {
  xxs: 0,
  xs: 660,
  sm: 800,
  md: 860,
  lg: 980,
  xl: 1120,
  xxl: 1280,
} as const;

export type Breakpoint = keyof typeof breakpoints;

// One `min-width` query per band transition, for raw CSS contexts. Each is the
// next band's lower bound, which makes `mediaQueries.gtX` the exact complement
// of the Tamagui `$X` max-width key built from the same scale.
//
// There is deliberately no `gtXxs` (Tamagui's first `gt*` query is `gtXs`) and
// no `gtXxl` (`xxl` is the top band — `$xxl` is itself a `min-width` query).
export const mediaQueries = {
  gtXs: `(min-width: ${breakpoints.sm}px)`,
  gtSm: `(min-width: ${breakpoints.md}px)`,
  gtMd: `(min-width: ${breakpoints.lg}px)`,
  gtLg: `(min-width: ${breakpoints.xl}px)`,
  gtXl: `(min-width: ${breakpoints.xxl}px)`,
} as const;

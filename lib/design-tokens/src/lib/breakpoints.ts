// Min-width thresholds (px) for design-tokens' own band vocabulary. These are
// NOT the same scale as @tamagui/config's `media` export (see
// node_modules/@tamagui/config/dist/cjs/media.js) — `md`/`lg`/`xl` in
// particular fire at different widths in Tamagui JSX than the numbers below.
// Use this file for raw numbers in non-Tamagui contexts (web-only CSS,
// canvas, native measurement); for what a Tamagui `$md`/`$lg` prop actually
// does, see .agents/skills/ui/references/responsive-density.md. Each value
// below is the lower bound of the named band; `xxs` starts at 0. Drift
// audited and this split made explicit in LS-9416 (see lib/design-tokens/README.md).
export const breakpoints = {
  xxs: 0,
  xs: 660,
  sm: 800,
  md: 860,
  lg: 980,
  xl: 1120,
} as const;

export type Breakpoint = keyof typeof breakpoints;

// One entry per xs→sm→md→lg→xl band transition. There is deliberately no
// `gtXxs` (xxs→xs) or `xxl`/`gtXl` band above `xl` — Tamagui's own media
// config has no equivalent for either, so keeping them here was a silent
// no-op trap for anyone who tried `$xxl` or `$gtXxs` in JSX. Removed in
// LS-9416; see the README for the audit that found no real consumer of them.
export const mediaQueries = {
  gtXs: `(min-width: ${breakpoints.sm}px)`,
  gtSm: `(min-width: ${breakpoints.md}px)`,
  gtMd: `(min-width: ${breakpoints.lg}px)`,
  gtLg: `(min-width: ${breakpoints.xl}px)`,
} as const;

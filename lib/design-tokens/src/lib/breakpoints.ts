// Min-width thresholds (px) mirroring @tamagui/config media defaults.
// Each value is the lower bound of the named band; `xxs` starts at 0.
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

export const mediaQueries = {
  gtXxs: `(min-width: ${breakpoints.xs}px)`,
  gtXs: `(min-width: ${breakpoints.sm}px)`,
  gtSm: `(min-width: ${breakpoints.md}px)`,
  gtMd: `(min-width: ${breakpoints.lg}px)`,
  gtLg: `(min-width: ${breakpoints.xl}px)`,
  gtXl: `(min-width: ${breakpoints.xxl}px)`,
} as const;

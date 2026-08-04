// Type scale (px) and unit-less line-height ramp — mirror of the
// foundation bundle's --text-*/--leading-* custom properties
// (docs/design/7SRWFMj3a6khIhwLuWkSKA/legacy-sports-design-system/
// project/colors_and_type.css) and the Tamagui $1–$10 font-size scale
// referenced by lib/tamagui-config.

export const typeScale = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 36,
  '4xl': 48,
  '5xl': 64,
  '6xl': 80,
} as const;

export type TypeScaleStep = keyof typeof typeScale;

export const leading = {
  tight: 1.1,
  snug: 1.3,
  body: 1.55,
  loose: 1.8,
} as const;

export type LeadingStep = keyof typeof leading;

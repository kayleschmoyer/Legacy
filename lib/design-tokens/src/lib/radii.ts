export const radii = {
  1: 4,
  2: 6,
  3: 8,
  4: 12,
  5: 16,
  6: 20,
  7: 24,
  pill: 9999,
} as const;

export type RadiusStep = keyof typeof radii;

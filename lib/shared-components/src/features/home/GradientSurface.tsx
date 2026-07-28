/**
 * GradientSurface (web) — a two-stop linear gradient painted behind arbitrary
 * children, using a CSS `linear-gradient` on `backgroundImage`.
 *
 * The native sibling (`GradientSurface.native.tsx`) paints the same gradient
 * with `react-native-svg`: neither `expo-linear-gradient` nor
 * `react-native-linear-gradient` is installed, and `react-native-svg` is
 * already a dependency (LS-8794).
 *
 * Colour stops are raw strings by design — callers resolve them per theme via
 * `useThemeTokens()` rather than hardcoding hex, so both themes stay correct
 * (see `.agents/skills/ui/SKILL.md`).
 */
import React from 'react';
import { YStack } from 'tamagui';
import type { GradientSurfaceProps } from './GradientSurface.types';

export type { GradientSurfaceProps };

export function GradientSurface({
  colors,
  angle = 135,
  children,
  ...rest
}: GradientSurfaceProps): React.JSX.Element {
  const [from, to] = colors;
  return (
    <YStack
      {...rest}
      style={{
        backgroundImage: `linear-gradient(${angle}deg, ${from}, ${to})`,
      }}
    >
      {children}
    </YStack>
  );
}

export default GradientSurface;

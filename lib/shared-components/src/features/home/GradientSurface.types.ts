/**
 * Shared prop contract for the platform-split `GradientSurface` (LS-8794).
 *
 * Declared explicitly rather than derived from Tamagui's `YStack` props:
 * `React.ComponentProps<typeof YStack>` resolves to `any` here, which silently
 * collapses any intersection built on it (and defeats typecheck on the props
 * that matter, `colors` included). An explicit surface keeps the component
 * honest and documents exactly what it forwards.
 */
import type React from 'react';

export interface GradientSurfaceProps {
  /** `[from, to]` colour stops, already resolved for the active theme. */
  colors: readonly [string, string];
  /** CSS gradient angle in degrees (0 = to top, 90 = to right). Defaults to 135. */
  angle?: number;
  children?: React.ReactNode;

  // Forwarded layout / presentation props — the subset the Home layout uses.
  testID?: string;
  accessibilityRole?: 'button';
  accessibilityLabel?: string;
  onPress?: () => void;
  width?: number | string;
  height?: number | string;
  /** Radius applied to every corner that has no explicit per-corner value. */
  borderRadius?: number;
  borderTopLeftRadius?: number;
  borderTopRightRadius?: number;
  borderBottomRightRadius?: number;
  borderBottomLeftRadius?: number;
  overflow?: 'hidden' | 'visible';
  flexDirection?: 'row' | 'column';
  alignItems?: 'center' | 'flex-start' | 'flex-end' | 'stretch';
  justifyContent?: 'center' | 'flex-start' | 'flex-end' | 'space-between';
  gap?: number | string;
  padding?: number;
  paddingVertical?: number;
  paddingHorizontal?: number;
  cursor?: 'pointer' | 'default';
  pressStyle?: { opacity?: number };
}

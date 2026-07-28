/**
 * GradientSurface (native) — `react-native-svg` port of the web
 * `GradientSurface`, so the Home avatar / live-ticker / progress-bar gradients
 * render identically on mobile without adding a linear-gradient dependency
 * (LS-8794). See `GradientSurface.tsx` for the shared contract.
 */
import React, { useId } from 'react';
import { StyleSheet } from 'react-native';
import { YStack } from 'tamagui';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { GradientSurfaceProps } from './GradientSurface.types';

export type { GradientSurfaceProps };

interface Endpoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Converts a CSS gradient angle (0° = to top, increasing clockwise) into the
 * objectBoundingBox end points `<linearGradient>` expects. Exact for square
 * surfaces; a close approximation on other aspect ratios, which is all these
 * decorative two-stop gradients need.
 */
export function gradientEndpoints(angle: number): Endpoints {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  // SVG's y axis grows downward, so "to top" is a negative y step.
  const dy = -Math.cos(rad);
  const half = (Math.abs(dx) + Math.abs(dy)) / 2;
  return {
    x1: 0.5 - dx * half,
    y1: 0.5 - dy * half,
    x2: 0.5 + dx * half,
    y2: 0.5 + dy * half,
  };
}

export function GradientSurface({
  colors,
  angle = 135,
  children,
  ...rest
}: GradientSurfaceProps): React.JSX.Element {
  // `useId` returns colon-delimited ids (":r0:"); strip them so the value is a
  // safe SVG fragment identifier.
  const gradientId = `gradient-${useId().replace(/:/g, '')}`;
  const { x1, y1, x2, y2 } = gradientEndpoints(angle);
  const [from, to] = colors;

  return (
    <YStack {...rest}>
      <Svg
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id={gradientId} x1={x1} y1={y1} x2={x2} y2={y2}>
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill={`url(#${gradientId})`}
        />
      </Svg>
      {children}
    </YStack>
  );
}

export default GradientSurface;

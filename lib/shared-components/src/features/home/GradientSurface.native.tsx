/**
 * GradientSurface (native) — `react-native-svg` port of the web
 * `GradientSurface`, so the Home avatar / live-ticker / progress-bar gradients
 * render identically on mobile without adding a linear-gradient dependency
 * (LS-8794). See `GradientSurface.tsx` for the shared contract.
 *
 * The gradient is painted into an absolutely-positioned `<Svg>` sized in
 * **pixels** from `onLayout`, never with `width="100%"`. Percentage sizing on
 * the root `<Svg>` under `StyleSheet.absoluteFill` mis-measures on Android when
 * the surface is intrinsically sized (its height comes from its children): the
 * canvas ends up the wrong size and offset, which both paints the gradient as a
 * ragged bar outside the surface *and* wipes the parent card's background and
 * border where the oversized canvas lands (LS-8808 defects 1 and 2). Surfaces
 * with explicit pixel dimensions — the Home avatar — happened to escape it,
 * which is why only the live-ticker header broke.
 *
 * Corners are cut into the gradient path itself rather than left to the
 * parent's `overflow: 'hidden'` + `borderRadius`: Android does not reliably
 * clip non-background children to a parent's border radius.
 */
import React, { useCallback, useId, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet } from 'react-native';
import { YStack } from 'tamagui';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import type { GradientSurfaceProps } from './GradientSurface.types';

export type { GradientSurfaceProps };

interface Endpoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Per-corner radii, already clamped to the surface. */
export interface CornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

/**
 * Converts a CSS gradient angle (0° = to top, increasing clockwise) into the
 * unit-square end points `<linearGradient>` expects. Exact for square
 * surfaces; a close approximation on other aspect ratios, which is all these
 * decorative two-stop gradients need. Callers scale the result by the measured
 * surface size, because the gradient is emitted in `userSpaceOnUse` units so a
 * single definition stays consistent across the whole path.
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

/** Radius props a caller may set; mirrors the `GradientSurfaceProps` subset. */
type RadiusProps = Pick<
  GradientSurfaceProps,
  | 'borderRadius'
  | 'borderTopLeftRadius'
  | 'borderTopRightRadius'
  | 'borderBottomRightRadius'
  | 'borderBottomLeftRadius'
>;

/**
 * Resolves the four corner radii, falling back to `borderRadius` per corner and
 * clamping each to half the shorter side so a "pill" radius (9999) becomes a
 * true capsule instead of an invalid arc.
 */
export function resolveCornerRadii(
  { borderRadius = 0, ...corners }: RadiusProps,
  width: number,
  height: number,
): CornerRadii {
  const max = Math.max(0, Math.min(width, height) / 2);
  const clamp = (value: number | undefined): number =>
    Math.min(Math.max(value ?? borderRadius, 0), max);
  return {
    topLeft: clamp(corners.borderTopLeftRadius),
    topRight: clamp(corners.borderTopRightRadius),
    bottomRight: clamp(corners.borderBottomRightRadius),
    bottomLeft: clamp(corners.borderBottomLeftRadius),
  };
}

/** Layout floats carry more precision than a path needs. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Builds the `d` attribute for a rectangle with independent corner radii,
 * drawn clockwise from the top-left corner.
 */
export function roundedRectPath(
  width: number,
  height: number,
  radii: CornerRadii,
): string {
  const w = round(width);
  const h = round(height);
  const tl = round(radii.topLeft);
  const tr = round(radii.topRight);
  const br = round(radii.bottomRight);
  const bl = round(radii.bottomLeft);

  // Subtractions are re-rounded: `100.001 - 0.003` is not exactly `99.998` in
  // binary floating point, and the raw value would leak into the `d` attribute.
  return [
    `M ${tl} 0`,
    `H ${round(w - tr)}`,
    tr > 0 ? `A ${tr} ${tr} 0 0 1 ${w} ${tr}` : null,
    `V ${round(h - br)}`,
    br > 0 ? `A ${br} ${br} 0 0 1 ${round(w - br)} ${h}` : null,
    `H ${bl}`,
    bl > 0 ? `A ${bl} ${bl} 0 0 1 0 ${round(h - bl)}` : null,
    `V ${tl}`,
    tl > 0 ? `A ${tl} ${tl} 0 0 1 ${tl} 0` : null,
    'Z',
  ]
    .filter((segment): segment is string => segment !== null)
    .join(' ');
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
  const [from, to] = colors;
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((previous) =>
      previous && previous.width === width && previous.height === height
        ? previous
        : { width, height },
    );
  }, []);

  const measured = size != null && size.width > 0 && size.height > 0;
  const endpoints = gradientEndpoints(angle);

  return (
    // The "from" stop also paints the Tamagui background so the surface is
    // never bare on the first frame, before `onLayout` has reported a size.
    <YStack backgroundColor={from} {...rest} onLayout={handleLayout}>
      {measured ? (
        <Svg
          width={size.width}
          height={size.height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Defs>
            <LinearGradient
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              x1={endpoints.x1 * size.width}
              y1={endpoints.y1 * size.height}
              x2={endpoints.x2 * size.width}
              y2={endpoints.y2 * size.height}
            >
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          </Defs>
          <Path
            d={roundedRectPath(
              size.width,
              size.height,
              resolveCornerRadii(rest, size.width, size.height),
            )}
            fill={`url(#${gradientId})`}
          />
        </Svg>
      ) : null}
      {children}
    </YStack>
  );
}

export default GradientSurface;

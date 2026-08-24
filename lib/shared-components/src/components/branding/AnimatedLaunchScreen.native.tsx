import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { Text, Theme, YStack } from 'tamagui';
import { BrandLogo } from './BrandLogo';
import medallionAsset from './assets/logo-512.png';
import { BG_DARK, BRAND_GOLD, withAlpha } from '../../utils/colors';

/**
 * Timings for the LS-9746 draw -> punch-in -> stamp choreography, compressed
 * from the design handoff's 5.0s "showcase" cut per its "Production timing"
 * section (docs/design/launch-animation-2026-08-24/.../README.md): draw+punch
 * ~=0.95s+0.45s, wordmark stamp during a ~0.4s hold, existing 150ms fade.
 * Total is ~1.95s — richer than the LS-9464 ~1.2s guidance, a deliberate
 * trade-off recorded in this ticket's Jira notes: the fuller choreography
 * needs the extra room to read, and 1.95s is still a normal splash-reveal
 * length.
 */
export const LAUNCH_DRAW_MS = 950;
export const LAUNCH_PUNCH_MS = 450;
export const LAUNCH_STAMP_MS = 400;
export const LAUNCH_FADE_OUT_MS = 150;
export const LAUNCH_TOTAL_MS =
  LAUNCH_DRAW_MS + LAUNCH_PUNCH_MS + LAUNCH_STAMP_MS + LAUNCH_FADE_OUT_MS;

/**
 * Fail-safe for the `start` gate (LS-9728): if the caller never signals
 * `start`, the choreography begins on its own after this delay so the
 * overlay can never hold the app hostage behind an opaque full-screen
 * surface.
 */
export const LAUNCH_START_FAILSAFE_MS = 2000;

export interface AnimatedLaunchScreenProps {
  /** Called once the overlay has fully faded out; unmount it then. */
  onFinished?: () => void;
  /**
   * Visibility gate for the choreography (LS-9728). While `false`, the
   * overlay renders its initial frame (opaque field, nothing drawn yet) and
   * none of the timeline runs — pass `true` once the native splash has
   * actually hidden (`SplashScreen.hideAsync()` resolved), so the reveal
   * cannot play unseen behind the splash. Defaults to `true` for standalone
   * use. The `LAUNCH_START_FAILSAFE_MS` fail-safe begins the timeline anyway
   * if the signal never arrives.
   */
  start?: boolean;
  testID?: string;
}

const OVERLAY_STYLE = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
  // BG_DARK matches the native splash background (apps/app/app.json) and the
  // BrandedSplash field so the native -> JS handoff has no visible flash.
  backgroundColor: BG_DARK,
} as const;

// `@nx/react/typings/image.d.ts` (this package's `tsconfig.lib.json` types
// entry) declares `*.png` as a `string` default export for web bundlers.
// Under Metro (React Native), a static image import instead resolves to a
// numeric packager asset id — the shape `Image`/`Animated.Image`'s `source`
// prop actually expects here. Bridge the two static types via `unknown`.
const MEDALLION_SRC = medallionAsset as unknown as number;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);

// ── Geometry (viewBox 0 0 512 512, matches logo-512.png framing) ──
// Ported 1:1 from the design handoff's reference implementation
// (docs/design/launch-animation-2026-08-24/.../project/logo-anim.jsx).
const DEG = Math.PI / 180;
const pt = (
  cx: number,
  cy: number,
  r: number,
  aDeg: number,
): [number, number] => [
  cx + r * Math.cos(aDeg * DEG),
  cy + r * Math.sin(aDeg * DEG),
];

interface Segment {
  from: [number, number];
  to: [number, number];
}

// Laurel (left half; right half is a mirrored <G>).
const LAUREL_CENTER: [number, number] = [256, 262];
const LAUREL_RADIUS = 176;
const STEM_POINTS: [number, number][] = [];
for (let a = 96; a <= 226; a += 10) {
  STEM_POINTS.push(pt(LAUREL_CENTER[0], LAUREL_CENTER[1], LAUREL_RADIUS, a));
}
const STEM_PATH = `M ${STEM_POINTS.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ')}`;

const LEAVES: Segment[] = [];
for (let i = 0; i < 12; i++) {
  const a = 106 + i * 10;
  const p = pt(LAUREL_CENTER[0], LAUREL_CENTER[1], LAUREL_RADIUS, a);
  const out: [number, number] = [Math.cos(a * DEG), Math.sin(a * DEG)];
  const tan: [number, number] = [-Math.sin(a * DEG), Math.cos(a * DEG)];
  const s = i % 2 ? 1 : -0.85;
  LEAVES.push({
    from: p,
    to: [
      p[0] + (0.55 * tan[0] + s * 0.8 * out[0]) * 30,
      p[1] + (0.55 * tan[1] + s * 0.8 * out[1]) * 30,
    ],
  });
}

// Baseball seam (left half; right is mirrored) + stitch ticks.
type CubicBezier = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];
const SEAM: CubicBezier = [
  [207, 166],
  [156, 222],
  [156, 296],
  [207, 350],
];
const SEAM_PATH = `M${SEAM[0][0]},${SEAM[0][1]} C${SEAM[1][0]},${SEAM[1][1]} ${SEAM[2][0]},${SEAM[2][1]} ${SEAM[3][0]},${SEAM[3][1]}`;

const bez = (P: CubicBezier, u: number): [number, number] => {
  const k = 1 - u;
  const x =
    k * k * k * P[0][0] +
    3 * k * k * u * P[1][0] +
    3 * k * u * u * P[2][0] +
    u * u * u * P[3][0];
  const y =
    k * k * k * P[0][1] +
    3 * k * k * u * P[1][1] +
    3 * k * u * u * P[2][1] +
    u * u * u * P[3][1];
  return [x, y];
};

const TICKS: Segment[] = [];
for (let i = 0; i < 8; i++) {
  const u = 0.1 + (i * 0.8) / 7;
  const b = bez(SEAM, u);
  const b2 = bez(SEAM, u + 0.01);
  let t: [number, number] = [b2[0] - b[0], b2[1] - b[1]];
  const tl = Math.hypot(t[0], t[1]);
  t = [t[0] / tl, t[1] / tl];
  const n: [number, number] = [-t[1], t[0]];
  let d: [number, number] = [n[0] + 0.45 * t[0], n[1] + 0.45 * t[1]];
  const dl = Math.hypot(d[0], d[1]);
  d = [d[0] / dl, d[1] / dl];
  TICKS.push({
    from: [b[0] - 9 * d[0], b[1] - 9 * d[1]],
    to: [b[0] + 9 * d[0], b[1] + 9 * d[1]],
  });
}

// Star (5-point, centered above the ball).
const STAR_POINTS: [number, number][] = [];
for (let i = 0; i < 10; i++) {
  const r = i % 2 ? 16 : 40;
  STAR_POINTS.push(pt(256, 104, r, -90 + i * 36));
}
const STAR_PATH = `M ${STAR_POINTS.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ')} Z`;

// Real stroke lengths for the dash-reveal technique below. The installed
// react-native-svg (15.15.5) type defs don't expose the SVG2 `pathLength`
// normalization prop, so `strokeDasharray`/`strokeDashoffset` are driven in
// actual viewBox units instead of the design handoff's 0..1 normalized space
// (`logo-anim.jsx`'s `pathLength="1"` trick) — same visual result.
const polylineLength = (points: readonly [number, number][]): number => {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
    );
  }
  return total;
};

const OUTER_RING_LENGTH = 2 * Math.PI * 238;
const INNER_RING_LENGTH = 2 * Math.PI * 212;
const BASEBALL_LENGTH = 2 * Math.PI * 106;
const STEM_LENGTH = polylineLength(STEM_POINTS);
const STAR_LENGTH = polylineLength([...STAR_POINTS, STAR_POINTS[0]]);
// SEAM_PATH is a single cubic bezier with no closed-form length — approximate
// by summing many short chords sampled along the curve.
const SEAM_LENGTH = polylineLength(
  Array.from({ length: 101 }, (_, i) => bez(SEAM, i / 100)),
);

/** Draw-phase sub-windows, as fractions of the draw phase (start-end). */
const WINDOW = {
  outerRing: [0, 0.28] as const,
  innerRing: [0.08, 0.34] as const,
  baseball: [0.18, 0.46] as const,
  seam: [0.34, 0.58] as const,
  ticks: [0.46, 0.72] as const,
  stem: [0.42, 0.68] as const,
  leaves: [0.56, 0.88] as const,
  star: [0.78, 1] as const,
};

type Interpolated = Animated.AnimatedInterpolation<number>;

/** `drawProgress`'s local progress within a [a, b] sub-window, clamped 0..1. */
function windowProgress(
  driver: Animated.Value,
  [a, b]: readonly [number, number],
): Interpolated {
  return driver.interpolate({
    inputRange: [a, b],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
}

/** Dash-reveal offset: `length` (fully hidden) down to `0` (fully drawn) as progress goes 0..1. */
function dashOffsetFor(progress: Interpolated, length: number): Interpolated {
  return progress.interpolate({ inputRange: [0, 1], outputRange: [length, 0] });
}

/** Opacity for item `index` of `count`, appearing one-by-one across `window`. */
function staggerOpacity(
  driver: Animated.Value,
  window: readonly [number, number],
  count: number,
  index: number,
): Interpolated {
  return windowProgress(driver, window).interpolate({
    inputRange: [index / count, (index + 1) / count],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
}

const STROKE_COMMON = {
  fill: 'none',
  stroke: BRAND_GOLD,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function SketchMedallion({
  drawProgress,
}: {
  drawProgress: Animated.Value;
}): React.JSX.Element {
  const renderHalf = (mirror: boolean) => (
    <G
      key={mirror ? 'right' : 'left'}
      transform={mirror ? 'translate(512,0) scale(-1,1)' : undefined}
    >
      <AnimatedPath
        d={SEAM_PATH}
        strokeDasharray={SEAM_LENGTH}
        strokeDashoffset={dashOffsetFor(
          windowProgress(drawProgress, WINDOW.seam),
          SEAM_LENGTH,
        )}
        strokeWidth={6}
        {...STROKE_COMMON}
      />
      {TICKS.map((tick, i) => (
        <AnimatedLine
          key={i}
          x1={tick.from[0]}
          y1={tick.from[1]}
          x2={tick.to[0]}
          y2={tick.to[1]}
          strokeWidth={4.5}
          opacity={staggerOpacity(drawProgress, WINDOW.ticks, TICKS.length, i)}
          {...STROKE_COMMON}
        />
      ))}
      <AnimatedPath
        d={STEM_PATH}
        strokeDasharray={STEM_LENGTH}
        strokeDashoffset={dashOffsetFor(
          windowProgress(drawProgress, WINDOW.stem),
          STEM_LENGTH,
        )}
        strokeWidth={5}
        {...STROKE_COMMON}
      />
      {LEAVES.map((leaf, i) => (
        <AnimatedLine
          key={i}
          x1={leaf.from[0]}
          y1={leaf.from[1]}
          x2={leaf.to[0]}
          y2={leaf.to[1]}
          strokeWidth={7}
          opacity={staggerOpacity(
            drawProgress,
            WINDOW.leaves,
            LEAVES.length,
            i,
          )}
          {...STROKE_COMMON}
        />
      ))}
    </G>
  );

  return (
    <Svg viewBox="0 0 512 512" width="100%" height="100%">
      <AnimatedCircle
        cx={256}
        cy={256}
        r={238}
        strokeDasharray={OUTER_RING_LENGTH}
        strokeDashoffset={dashOffsetFor(
          windowProgress(drawProgress, WINDOW.outerRing),
          OUTER_RING_LENGTH,
        )}
        strokeWidth={7}
        {...STROKE_COMMON}
      />
      <AnimatedCircle
        cx={256}
        cy={256}
        r={212}
        strokeDasharray={INNER_RING_LENGTH}
        strokeDashoffset={dashOffsetFor(
          windowProgress(drawProgress, WINDOW.innerRing),
          INNER_RING_LENGTH,
        )}
        strokeWidth={4}
        {...STROKE_COMMON}
      />
      <AnimatedCircle
        cx={256}
        cy={258}
        r={106}
        strokeDasharray={BASEBALL_LENGTH}
        strokeDashoffset={dashOffsetFor(
          windowProgress(drawProgress, WINDOW.baseball),
          BASEBALL_LENGTH,
        )}
        strokeWidth={6}
        {...STROKE_COMMON}
      />
      {renderHalf(false)}
      {renderHalf(true)}
      <AnimatedPath
        d={STAR_PATH}
        strokeDasharray={STAR_LENGTH}
        strokeDashoffset={dashOffsetFor(
          windowProgress(drawProgress, WINDOW.star),
          STAR_LENGTH,
        )}
        strokeWidth={5}
        {...STROKE_COMMON}
      />
    </Svg>
  );
}

/**
 * AnimatedLaunchScreen (native) — full-screen branded launch overlay shown
 * once per cold start of the mobile app (LS-9464), layered above the app UI
 * immediately after the static native splash hides. Draw -> punch-in ->
 * stamp choreography (LS-9746, design handoff:
 * docs/design/launch-animation-2026-08-24/): the brand medallion is
 * sketch-drawn in gold ink strokes, punches in to the real logo bitmap with
 * an overshoot pop + gold flash ring + camera kick, then the wordmark lockup
 * stamps in (hard scale-down pop, no translate).
 *
 * Cold-start-only gating is the *caller's* job via first-mount state (see
 * apps/app/src/app/_layout.tsx) — this component plays once, beginning when
 * the `start` prop turns true (or immediately on mount when it is omitted).
 * The fixed-length phase timers are scheduled independently of the
 * Reduce-Motion check and of any animation's completion callback, so the
 * overlay can never wedge on-screen (LS-9728 invariant, preserved here).
 *
 * When the OS "Reduce Motion" setting is on, the choreography collapses to
 * the final frame (real logo + wordmark, no sketch/punch/stamp/flash/kick)
 * and only the opacity-only fade-out runs.
 */
export function AnimatedLaunchScreen({
  onFinished,
  start = true,
  testID = 'animated-launch-screen',
}: AnimatedLaunchScreenProps): React.JSX.Element {
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const drawProgress = useRef(new Animated.Value(0)).current;
  const punchLinear = useRef(new Animated.Value(0)).current;
  const punchPop = useRef(new Animated.Value(0)).current;
  const stampLinear = useRef(new Animated.Value(0)).current;
  const stampPop = useRef(new Animated.Value(0)).current;
  const punchKick = useRef(new Animated.Value(0)).current;
  const wordKick = useRef(new Animated.Value(0)).current;
  const wobble = useRef(new Animated.Value(0)).current;
  const kickBase = useRef(new Animated.Value(1)).current;

  const [begun, setBegun] = useState(start);
  const [reduceMotion, setReduceMotion] = useState(false);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    if (start) setBegun(true);
  }, [start]);

  // Fail-safe: begin even without the start signal so the opaque overlay can
  // never wedge on-screen waiting for a hide that never resolves.
  useEffect(() => {
    if (begun) return;
    const failsafeTimer = setTimeout(
      () => setBegun(true),
      LAUNCH_START_FAILSAFE_MS,
    );
    return () => clearTimeout(failsafeTimer);
  }, [begun]);

  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    if (!begun) return;
    let cancelled = false;
    let wobbleLoop: Animated.CompositeAnimation | null = null;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        reduceMotionRef.current = reduce;
        setReduceMotion(reduce);
        if (reduce) return;

        Animated.timing(drawProgress, {
          toValue: 1,
          duration: LAUNCH_DRAW_MS,
          easing: Easing.linear,
          useNativeDriver: false,
        }).start();

        wobbleLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(wobble, {
              toValue: 1,
              duration: 90,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
            Animated.timing(wobble, {
              toValue: -1,
              duration: 180,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
            Animated.timing(wobble, {
              toValue: 0,
              duration: 90,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
          ]),
        );
        wobbleLoop.start();
      })
      .catch(() => {
        if (cancelled) return;
        reduceMotionRef.current = false;
        Animated.timing(drawProgress, {
          toValue: 1,
          duration: LAUNCH_DRAW_MS,
          easing: Easing.linear,
          useNativeDriver: false,
        }).start();
      });

    // Fixed-length phase timeline — scheduled synchronously here (not inside
    // the Reduce-Motion promise) so it never depends on that check or on any
    // animation's completion callback finishing.
    const punchTimer = setTimeout(() => {
      if (cancelled || reduceMotionRef.current) return;
      wobbleLoop?.stop();
      wobble.setValue(0);
      // Camera kick amount from the design handoff's `kick(punchAt, 0.045)`.
      punchKick.setValue(0.045);
      Animated.parallel([
        Animated.timing(punchLinear, {
          toValue: 1,
          duration: LAUNCH_PUNCH_MS,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(punchPop, {
          toValue: 1,
          duration: LAUNCH_PUNCH_MS,
          easing: Easing.out(Easing.back(1.7)),
          useNativeDriver: false,
        }),
        Animated.timing(punchKick, {
          toValue: 0,
          duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    }, LAUNCH_DRAW_MS);

    const stampTimer = setTimeout(() => {
      if (cancelled || reduceMotionRef.current) return;
      // Camera kick amount from the design handoff's `kick(wordAt, 0.025)`.
      wordKick.setValue(0.025);
      Animated.parallel([
        Animated.timing(stampLinear, {
          toValue: 1,
          duration: LAUNCH_STAMP_MS,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(stampPop, {
          toValue: 1,
          duration: LAUNCH_STAMP_MS,
          easing: Easing.out(Easing.back(1.7)),
          useNativeDriver: false,
        }),
        Animated.timing(wordKick, {
          toValue: 0,
          duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    }, LAUNCH_DRAW_MS + LAUNCH_PUNCH_MS);

    const fadeTimer = setTimeout(
      () => {
        if (cancelled) return;
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: LAUNCH_FADE_OUT_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }).start();
      },
      LAUNCH_DRAW_MS + LAUNCH_PUNCH_MS + LAUNCH_STAMP_MS,
    );

    const finishTimer = setTimeout(() => {
      onFinishedRef.current?.();
    }, LAUNCH_TOTAL_MS);

    return () => {
      cancelled = true;
      wobbleLoop?.stop();
      clearTimeout(punchTimer);
      clearTimeout(stampTimer);
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [
    begun,
    overlayOpacity,
    drawProgress,
    punchLinear,
    punchPop,
    stampLinear,
    stampPop,
    punchKick,
    wordKick,
    wobble,
  ]);

  const sketchOpacity = Animated.multiply(
    drawProgress.interpolate({
      inputRange: [0, 0.001, 1],
      outputRange: [0, 1, 1],
    }),
    punchLinear.interpolate({
      inputRange: [0, 0.45, 1],
      outputRange: [1, 0, 0],
    }),
  );
  const sketchScale = punchLinear.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const sketchRotate = wobble.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-0.9deg', '0.9deg'],
  });

  const logoOpacity = punchLinear.interpolate({
    inputRange: [0, 0.1, 0.55, 1],
    outputRange: [0, 0, 1, 1],
  });
  const logoScale = punchPop.interpolate({
    inputRange: [0, 1],
    outputRange: [1.3, 1.0],
  });

  const flashOpacity = punchLinear.interpolate({
    inputRange: [0, 0.001, 0.85, 1],
    outputRange: [0, 0.65, 0, 0],
  });
  const flashScale = punchLinear.interpolate({
    inputRange: [0, 0.85, 1],
    outputRange: [1, 1.45, 1.45],
  });

  const wordOpacity = stampLinear.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 1, 1],
  });
  const wordScale = stampPop.interpolate({
    inputRange: [0, 1],
    outputRange: [1.7, 1.0],
  });

  const contentScale = Animated.add(
    kickBase,
    Animated.add(punchKick, wordKick),
  );

  if (reduceMotion) {
    return (
      <Animated.View
        testID={testID}
        style={[OVERLAY_STYLE, { opacity: overlayOpacity }]}
      >
        <Theme name="legacy_dark">
          <YStack
            flex={1}
            alignItems="center"
            justifyContent="center"
            padding="$6"
          >
            <YStack alignItems="center" gap="$4">
              <YStack
                width={250}
                height={250}
                alignItems="center"
                justifyContent="center"
              >
                <Image
                  source={MEDALLION_SRC}
                  style={{ width: 250, height: 250 }}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              </YStack>
              <YStack alignItems="center" gap="$3">
                <YStack
                  width={48}
                  height={2}
                  borderRadius={2}
                  backgroundColor={withAlpha(BRAND_GOLD, 0.65)}
                />
                <BrandLogo wordmarkOnly />
                <Text
                  fontFamily="$body"
                  fontStyle="italic"
                  fontSize={13}
                  color="$textMuted"
                >
                  Where history plays on.
                </Text>
              </YStack>
            </YStack>
          </YStack>
        </Theme>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      testID={testID}
      style={[OVERLAY_STYLE, { opacity: overlayOpacity }]}
    >
      <Theme name="legacy_dark">
        <Animated.View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            transform: [{ scale: contentScale }],
          }}
        >
          <YStack alignItems="center" gap="$7">
            <YStack width={250} height={250}>
              <Animated.View
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: sketchOpacity,
                  transform: [{ scale: sketchScale }, { rotate: sketchRotate }],
                }}
              >
                <SketchMedallion drawProgress={drawProgress} />
              </Animated.View>
              <Animated.Image
                source={MEDALLION_SRC}
                resizeMode="contain"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  opacity: logoOpacity,
                  transform: [{ scale: logoScale }],
                }}
              />
              <Animated.View
                style={{
                  position: 'absolute',
                  inset: -8,
                  borderRadius: 999,
                  borderWidth: 2,
                  borderColor: BRAND_GOLD,
                  opacity: flashOpacity,
                  transform: [{ scale: flashScale }],
                }}
              />
            </YStack>
            <Animated.View
              style={{
                alignItems: 'center',
                opacity: wordOpacity,
                transform: [{ scale: wordScale }],
              }}
            >
              <YStack alignItems="center" gap="$4">
                <YStack
                  width={48}
                  height={2}
                  borderRadius={2}
                  backgroundColor={withAlpha(BRAND_GOLD, 0.65)}
                />
                <BrandLogo wordmarkOnly />
                <Text
                  fontFamily="$body"
                  fontStyle="italic"
                  fontSize={13}
                  color="$textMuted"
                >
                  Where history plays on.
                </Text>
              </YStack>
            </Animated.View>
          </YStack>
        </Animated.View>
      </Theme>
    </Animated.View>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { Text, Theme, YStack } from 'tamagui';
import { BrandLogo } from './BrandLogo';
import medallionAsset from './assets/logo-512.png';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  withAlpha,
} from '../../utils/colors';

/**
 * Timings for the LS-9747 "Slam" choreography (design handoff
 * `design_handoff_slam_launch/README.md`, "Production Timeline"): a
 * gold-ink baseball and football sketch in from the top/bottom, pull back
 * and slam together at center, burst into the real medallion bitmap, the
 * wordmark stamps in below it, then the whole lockup holds and fades.
 * Replaces the LS-9746 draw -> punch-in -> stamp cut (total ~1.95s) with a
 * fuller 4.40s choreography per the retimed production table — long enough
 * to read clearly, still a normal splash-reveal length.
 */
export const LAUNCH_DRAW_MS = 1300;
/** Anticipation pull-back + rush-to-center; impact lands at +400ms into this phase. */
export const LAUNCH_COLLIDE_MS = 800;
export const LAUNCH_IMPACT_OFFSET_MS = 400;
export const LAUNCH_STAMP_MS = 900;
export const LAUNCH_HOLD_MS = 1400;
/** Overlay opacity fade window, relative to the start of the Hold phase. */
export const LAUNCH_FADE_OUT_OFFSET_MS = 610;
export const LAUNCH_FADE_OUT_MS = 700;
export const LAUNCH_TOTAL_MS =
  LAUNCH_DRAW_MS + LAUNCH_COLLIDE_MS + LAUNCH_STAMP_MS + LAUNCH_HOLD_MS;

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
   * overlay renders only its initial opaque field (nothing drawn yet, no
   * static logo) and none of the timeline runs — pass `true` once the
   * native splash has actually hidden (`SplashScreen.hideAsync()`
   * resolved), so the reveal cannot play unseen behind the splash and no
   * static asset can flash on screen before it starts. Defaults to `true`
   * for standalone use. The `LAUNCH_START_FAILSAFE_MS` fail-safe begins the
   * timeline anyway if the signal never arrives.
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

// ── Sketch geometry, ported 1:1 from the design handoff's reference
// implementation (design_handoff_slam_launch/prototype/launch-app.jsx,
// `BaseballSketch`/`FootballSketch`) ──
type CubicBezier = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

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

// Real stroke lengths for the dash-reveal technique below. The installed
// react-native-svg (15.15.5) type defs don't expose the SVG2 `pathLength`
// normalization prop, so `strokeDasharray`/`strokeDashoffset` are driven in
// actual viewBox units instead of the design handoff's 0..1 normalized space
// (its `pathLength="1"` trick) — same visual result.
const bezLength = (P: CubicBezier): number =>
  polylineLength(Array.from({ length: 101 }, (_, i) => bez(P, i / 100)));

interface Segment {
  from: [number, number];
  to: [number, number];
}

/** Tick marks straddling a bezier at fixed `u` positions (used for baseball
 * stitches and football laces) — the tangent/normal construction mirrors
 * the design handoff's `seamTicks()`. */
function ticksAlongSeam(
  seam: CubicBezier,
  us: readonly number[],
  halfLen: number,
): Segment[] {
  return us.map((u) => {
    const b = bez(seam, u);
    const b2 = bez(seam, u + 0.01);
    let t: [number, number] = [b2[0] - b[0], b2[1] - b[1]];
    const tl = Math.hypot(t[0], t[1]);
    t = [t[0] / tl, t[1] / tl];
    let d: [number, number] = [-t[1] + 0.45 * t[0], t[0] + 0.45 * t[1]];
    const dl = Math.hypot(d[0], d[1]);
    d = [d[0] / dl, d[1] / dl];
    return {
      from: [b[0] - halfLen * d[0], b[1] - halfLen * d[1]],
      to: [b[0] + halfLen * d[0], b[1] + halfLen * d[1]],
    };
  });
}

// Baseball (viewBox 200x200, per handoff README "Baseball sketch" geometry).
const BASEBALL_SEAM: CubicBezier = [
  [76, 38],
  [44, 70],
  [44, 130],
  [76, 162],
];
const BASEBALL_SEAM_PATH = `M${BASEBALL_SEAM[0][0]},${BASEBALL_SEAM[0][1]} C${BASEBALL_SEAM[1][0]},${BASEBALL_SEAM[1][1]} ${BASEBALL_SEAM[2][0]},${BASEBALL_SEAM[2][1]} ${BASEBALL_SEAM[3][0]},${BASEBALL_SEAM[3][1]}`;
const BASEBALL_SEAM_LENGTH = bezLength(BASEBALL_SEAM);
const BASEBALL_CIRCLE_LENGTH = 2 * Math.PI * 78;
const BASEBALL_TICKS = ticksAlongSeam(
  BASEBALL_SEAM,
  [0.16, 0.4, 0.62, 0.85],
  7,
);

// Football (viewBox 240x150, per handoff README "Football sketch" geometry).
const FOOTBALL_BODY_PATH =
  'M14,75 C55,14 185,14 226,75 C185,136 55,136 14,75 Z';
const FOOTBALL_BODY_LENGTH =
  bezLength([
    [14, 75],
    [55, 14],
    [185, 14],
    [226, 75],
  ]) +
  bezLength([
    [226, 75],
    [185, 136],
    [55, 136],
    [14, 75],
  ]);
const FOOTBALL_BAND: CubicBezier = [
  [42, 49],
  [33, 66],
  [33, 84],
  [42, 101],
];
const FOOTBALL_BAND_PATH = `M${FOOTBALL_BAND[0][0]},${FOOTBALL_BAND[0][1]} C${FOOTBALL_BAND[1][0]},${FOOTBALL_BAND[1][1]} ${FOOTBALL_BAND[2][0]},${FOOTBALL_BAND[2][1]} ${FOOTBALL_BAND[3][0]},${FOOTBALL_BAND[3][1]}`;
const FOOTBALL_BAND_LENGTH = bezLength(FOOTBALL_BAND);
const FOOTBALL_LACE_LENGTH = 152 - 88;
const FOOTBALL_LACE_TICK_XS = [96, 108, 120, 132, 144];

const STROKE_COMMON = {
  fill: 'none',
  stroke: BRAND_GOLD,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
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

// The handoff's sketch windows are expressed as fractions of the [0.15s,
// 1.25s] dash-reveal sub-range of the Draw phase (README: "sketch on via
// stroke dash-reveal (0.15-1.25)"), not of the full LAUNCH_DRAW_MS. Map a
// local [a, b] fraction of that sub-range into a fraction of the full draw
// phase, since `drawProgress` below runs 0..1 across all of LAUNCH_DRAW_MS.
const DRAW_SKETCH_START_MS = 150;
const DRAW_SKETCH_END_MS = 1250;
function mapDrawWindow(a: number, b: number): readonly [number, number] {
  const startFrac = DRAW_SKETCH_START_MS / LAUNCH_DRAW_MS;
  const spanFrac = (DRAW_SKETCH_END_MS - DRAW_SKETCH_START_MS) / LAUNCH_DRAW_MS;
  return [startFrac + a * spanFrac, startFrac + b * spanFrac] as const;
}

const BASEBALL_WINDOW = {
  circle: mapDrawWindow(0, 0.5),
  seam: mapDrawWindow(0.32, 0.68),
  ticks: mapDrawWindow(0.6, 0.96),
};
const FOOTBALL_WINDOW = {
  body: mapDrawWindow(0, 0.55),
  band: mapDrawWindow(0.42, 0.68),
  lace: mapDrawWindow(0.55, 0.75),
  laceTicks: mapDrawWindow(0.72, 1),
};

function BaseballSketch({
  drawProgress,
}: {
  drawProgress: Animated.Value;
}): React.JSX.Element {
  const renderHalf = (mirror: boolean) => (
    <G
      key={mirror ? 'right' : 'left'}
      transform={mirror ? 'translate(200,0) scale(-1,1)' : undefined}
    >
      <AnimatedPath
        d={BASEBALL_SEAM_PATH}
        strokeDasharray={BASEBALL_SEAM_LENGTH}
        strokeDashoffset={dashOffsetFor(
          windowProgress(drawProgress, BASEBALL_WINDOW.seam),
          BASEBALL_SEAM_LENGTH,
        )}
        strokeWidth={5}
        {...STROKE_COMMON}
      />
      {BASEBALL_TICKS.map((tick, i) => (
        <AnimatedLine
          key={i}
          x1={tick.from[0]}
          y1={tick.from[1]}
          x2={tick.to[0]}
          y2={tick.to[1]}
          strokeWidth={4}
          opacity={staggerOpacity(
            drawProgress,
            BASEBALL_WINDOW.ticks,
            BASEBALL_TICKS.length,
            i,
          )}
          {...STROKE_COMMON}
        />
      ))}
    </G>
  );

  return (
    <Svg viewBox="0 0 200 200" width="100%" height="100%">
      <AnimatedCircle
        cx={100}
        cy={100}
        r={78}
        strokeDasharray={BASEBALL_CIRCLE_LENGTH}
        strokeDashoffset={dashOffsetFor(
          windowProgress(drawProgress, BASEBALL_WINDOW.circle),
          BASEBALL_CIRCLE_LENGTH,
        )}
        strokeWidth={6}
        {...STROKE_COMMON}
      />
      {renderHalf(false)}
      {renderHalf(true)}
    </Svg>
  );
}

function FootballSketch({
  drawProgress,
}: {
  drawProgress: Animated.Value;
}): React.JSX.Element {
  const renderBand = (mirror: boolean) => (
    <AnimatedPath
      key={mirror ? 'right' : 'left'}
      d={FOOTBALL_BAND_PATH}
      transform={mirror ? 'translate(240,0) scale(-1,1)' : undefined}
      strokeDasharray={FOOTBALL_BAND_LENGTH}
      strokeDashoffset={dashOffsetFor(
        windowProgress(drawProgress, FOOTBALL_WINDOW.band),
        FOOTBALL_BAND_LENGTH,
      )}
      strokeWidth={4.5}
      {...STROKE_COMMON}
    />
  );

  return (
    <Svg viewBox="0 0 240 150" width="100%" height="100%">
      <AnimatedPath
        d={FOOTBALL_BODY_PATH}
        strokeDasharray={FOOTBALL_BODY_LENGTH}
        strokeDashoffset={dashOffsetFor(
          windowProgress(drawProgress, FOOTBALL_WINDOW.body),
          FOOTBALL_BODY_LENGTH,
        )}
        strokeWidth={6}
        {...STROKE_COMMON}
      />
      {renderBand(false)}
      {renderBand(true)}
      <AnimatedLine
        x1={88}
        y1={75}
        x2={152}
        y2={75}
        strokeDasharray={FOOTBALL_LACE_LENGTH}
        strokeDashoffset={dashOffsetFor(
          windowProgress(drawProgress, FOOTBALL_WINDOW.lace),
          FOOTBALL_LACE_LENGTH,
        )}
        strokeWidth={4.5}
        {...STROKE_COMMON}
      />
      {FOOTBALL_LACE_TICK_XS.map((x, i) => (
        <AnimatedLine
          key={i}
          x1={x}
          y1={64}
          x2={x}
          y2={86}
          strokeWidth={4}
          opacity={staggerOpacity(
            drawProgress,
            FOOTBALL_WINDOW.laceTicks,
            FOOTBALL_LACE_TICK_XS.length,
            i,
          )}
          {...STROKE_COMMON}
        />
      ))}
    </Svg>
  );
}

// ── Layout (a centered stage, scaled down from the handoff's 390x844 design
// frame — this codebase's shared components use a centered flex layout
// rather than a fixed design-frame mapping; see BrandHero/the previous
// LS-9746 cut for precedent) ──
const STAGE_WIDTH = 260;
const STAGE_HEIGHT = 320;
const BALL_REST_OFFSET_PX = 88;
const BALL_SLIDE_EXTRA_PX = 120;
const BALL_PULL_BACK_PX = 14;
const BASEBALL_SIZE = { width: 120, height: 120 };
const FOOTBALL_SIZE = { width: 150, height: 94 };
const MEDALLION_SIZE = 210;

const SPARK_ANGLES = Array.from({ length: 10 }, (_, i) => i * 36 + 8);

/** Runs a `0 -> amplitude -> -amplitude -> 0` sine-eased loop, matching the
 * idle bob/wobble motion in the design handoff (stopped once the collide
 * phase begins, mirroring the LS-9746 wobble-loop precedent). */
function idleLoop(
  value: Animated.Value,
  amplitude: number,
  legMs: number,
): Animated.CompositeAnimation {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(value, {
        toValue: amplitude,
        duration: legMs,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: false,
      }),
      Animated.timing(value, {
        toValue: -amplitude,
        duration: legMs * 2,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: false,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration: legMs,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: false,
      }),
    ]),
  );
}

/**
 * AnimatedLaunchScreen (native) — full-screen branded launch overlay shown
 * once per cold start of the mobile app (LS-9464), layered above the app UI
 * immediately after the static native splash hides. "Slam" choreography
 * (LS-9747, replacing LS-9746's draw -> punch-in -> stamp cut; design
 * handoff: design_handoff_slam_launch/): a gold-ink baseball and football
 * sketch in from the top/bottom, pull back and slam together at center, the
 * impact bursts into the real medallion bitmap with a flash/ring/spark
 * burst and camera kick, the wordmark lockup stamps in below it, then the
 * whole thing holds with a soft breathing glow before fading out.
 *
 * Cold-start-only gating is the *caller's* job via first-mount state (see
 * apps/app/src/app/_layout.tsx) — this component plays once, beginning when
 * the `start` prop turns true (or immediately on mount when it is omitted).
 * The fixed-length phase timers are scheduled independently of the
 * Reduce-Motion check and of any animation's completion callback, so the
 * overlay can never wedge on-screen (LS-9728 invariant, preserved here).
 * While `start` is false, only the opaque field renders — no logo, sketch,
 * or wordmark is mounted — so nothing can flash on screen before the
 * choreography actually begins.
 *
 * When the OS "Reduce Motion" setting is on, the choreography collapses to
 * the final frame (real logo + wordmark + sub-line, no sketch/slam/stamp/
 * flash/kick) and only the opacity-only fade-out runs.
 */
export function AnimatedLaunchScreen({
  onFinished,
  start = true,
  testID = 'animated-launch-screen',
}: AnimatedLaunchScreenProps): React.JSX.Element {
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const drawProgress = useRef(new Animated.Value(0)).current;
  const slideDecay = useRef(new Animated.Value(BALL_SLIDE_EXTRA_PX)).current;
  const ballEnterOpacity = useRef(new Animated.Value(0)).current;
  const ballCut = useRef(new Animated.Value(1)).current;
  const collidePos = useRef(new Animated.Value(BALL_REST_OFFSET_PX)).current;
  const rushSpin = useRef(new Animated.Value(0)).current;
  const idleBob = useRef(new Animated.Value(0)).current;
  const idleWobble = useRef(new Animated.Value(0)).current;
  const flashProgress = useRef(new Animated.Value(0)).current;
  const ringProgress = useRef(new Animated.Value(0)).current;
  const medallionOpacity = useRef(new Animated.Value(0)).current;
  const medallionPop = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordPop = useRef(new Animated.Value(0)).current;
  const subOpacity = useRef(new Animated.Value(0)).current;
  const impactKick = useRef(new Animated.Value(0)).current;
  const wordKick = useRef(new Animated.Value(0)).current;
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
    let bobLoop: Animated.CompositeAnimation | null = null;
    let wobbleLoop: Animated.CompositeAnimation | null = null;
    let breatheLoop: Animated.CompositeAnimation | null = null;

    const startDrawPhase = (): void => {
      Animated.timing(drawProgress, {
        toValue: 1,
        duration: LAUNCH_DRAW_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();

      Animated.timing(slideDecay, {
        toValue: 0,
        duration: 350,
        delay: 50,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      Animated.timing(ballEnterOpacity, {
        toValue: 1,
        duration: 250,
        delay: 50,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();

      bobLoop = idleLoop(idleBob, 5, 327);
      bobLoop.start();
      wobbleLoop = idleLoop(idleWobble, 1.6, 90);
      wobbleLoop.start();
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        reduceMotionRef.current = reduce;
        setReduceMotion(reduce);
        if (!reduce) startDrawPhase();
      })
      .catch(() => {
        if (cancelled) return;
        reduceMotionRef.current = false;
        startDrawPhase();
      });

    // Fixed-length phase timeline — scheduled synchronously here (not inside
    // the Reduce-Motion promise) so it never depends on that check or on any
    // animation's completion callback finishing.
    const collideTimer = setTimeout(() => {
      if (cancelled || reduceMotionRef.current) return;
      bobLoop?.stop();
      wobbleLoop?.stop();
      idleBob.setValue(0);
      idleWobble.setValue(0);
      Animated.sequence([
        Animated.timing(collidePos, {
          toValue: BALL_REST_OFFSET_PX + BALL_PULL_BACK_PX,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(collidePos, {
          toValue: 0,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
      Animated.sequence([
        Animated.delay(160),
        Animated.timing(rushSpin, {
          toValue: 1,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    }, LAUNCH_DRAW_MS);

    const impactTimer = setTimeout(() => {
      if (cancelled || reduceMotionRef.current) return;
      ballCut.setValue(0);
      impactKick.setValue(0.05);
      Animated.timing(flashProgress, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
      Animated.timing(ringProgress, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      Animated.timing(medallionOpacity, {
        toValue: 1,
        duration: 100,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
      Animated.timing(medallionPop, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.back(1.7)),
        useNativeDriver: false,
      }).start();
      Animated.timing(impactKick, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }, LAUNCH_DRAW_MS + LAUNCH_IMPACT_OFFSET_MS);

    const wordTimer = setTimeout(
      () => {
        if (cancelled || reduceMotionRef.current) return;
        wordKick.setValue(0.025);
        Animated.timing(wordOpacity, {
          toValue: 1,
          duration: 210,
          easing: Easing.linear,
          useNativeDriver: false,
        }).start();
        Animated.timing(wordPop, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.7)),
          useNativeDriver: false,
        }).start();
        Animated.timing(wordKick, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
        Animated.timing(subOpacity, {
          toValue: 1,
          duration: 330,
          delay: 270,
          easing: Easing.linear,
          useNativeDriver: false,
        }).start();
      },
      LAUNCH_DRAW_MS + LAUNCH_COLLIDE_MS + 80,
    );

    const holdTimer = setTimeout(
      () => {
        if (cancelled || reduceMotionRef.current) return;
        breatheLoop = idleLoop(breathe, 1, 617);
        breatheLoop.start();
      },
      LAUNCH_DRAW_MS + LAUNCH_COLLIDE_MS + LAUNCH_STAMP_MS,
    );

    const fadeTimer = setTimeout(
      () => {
        if (cancelled) return;
        breatheLoop?.stop();
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: LAUNCH_FADE_OUT_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }).start();
      },
      LAUNCH_DRAW_MS +
        LAUNCH_COLLIDE_MS +
        LAUNCH_STAMP_MS +
        LAUNCH_FADE_OUT_OFFSET_MS,
    );

    const finishTimer = setTimeout(() => {
      onFinishedRef.current?.();
    }, LAUNCH_TOTAL_MS);

    return () => {
      cancelled = true;
      bobLoop?.stop();
      wobbleLoop?.stop();
      breatheLoop?.stop();
      clearTimeout(collideTimer);
      clearTimeout(impactTimer);
      clearTimeout(wordTimer);
      clearTimeout(holdTimer);
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [
    begun,
    overlayOpacity,
    drawProgress,
    slideDecay,
    ballEnterOpacity,
    ballCut,
    collidePos,
    rushSpin,
    idleBob,
    idleWobble,
    flashProgress,
    ringProgress,
    medallionOpacity,
    medallionPop,
    breathe,
    wordOpacity,
    wordPop,
    subOpacity,
    impactKick,
    wordKick,
  ]);

  const ballOpacity = Animated.multiply(ballEnterOpacity, ballCut);
  const ballScale = rushSpin.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.1],
  });
  const ballTravel = Animated.add(slideDecay, collidePos);

  const baseballTranslateY = Animated.multiply(-1, ballTravel);
  const baseballFinalY = Animated.add(baseballTranslateY, idleBob);
  const baseballRotateDeg = Animated.add(
    idleWobble,
    rushSpin.interpolate({ inputRange: [0, 1], outputRange: [0, -130] }),
  );
  const baseballRotate = baseballRotateDeg.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
  });

  const footballTranslateY = Animated.multiply(1, ballTravel);
  const footballFinalY = Animated.add(footballTranslateY, idleBob);
  const footballRotateDeg = Animated.add(
    idleWobble,
    rushSpin.interpolate({ inputRange: [0, 1], outputRange: [0, 220] }),
  );
  const footballRotate = footballRotateDeg.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
  });

  const flashOpacity = flashProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.75, 0],
  });
  const flashScale = flashProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1.6],
  });
  const ringOpacity = ringProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 0],
  });
  const ringScale = ringProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1.8],
  });
  const sparkOpacity = ringOpacity;
  const sparkTranslateX = ringProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [52, 148],
  });

  const medallionBreatheScale = breathe.interpolate({
    inputRange: [-1, 1],
    outputRange: [0.99, 1.01],
  });
  const medallionScale = Animated.multiply(
    medallionPop.interpolate({ inputRange: [0, 1], outputRange: [1.35, 1] }),
    medallionBreatheScale,
  );
  const glowOpacity = breathe.interpolate({
    inputRange: [-1, 1],
    outputRange: [0.18, 0.3],
  });

  const wordScale = wordPop.interpolate({
    inputRange: [0, 1],
    outputRange: [1.7, 1],
  });

  const contentScale = Animated.add(
    kickBase,
    Animated.add(impactKick, wordKick),
  );

  if (!begun) {
    return (
      <Animated.View
        testID={testID}
        style={[OVERLAY_STYLE, { opacity: overlayOpacity }]}
      />
    );
  }

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
                width={MEDALLION_SIZE}
                height={MEDALLION_SIZE}
                alignItems="center"
                justifyContent="center"
              >
                <Image
                  source={MEDALLION_SRC}
                  style={{ width: MEDALLION_SIZE, height: MEDALLION_SIZE }}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              </YStack>
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
                  fontWeight="600"
                  fontSize={13}
                  letterSpacing={5}
                  color="$textMuted"
                >
                  {'BASEBALL  ·  FOOTBALL'}
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
          <YStack
            width={STAGE_WIDTH}
            height={STAGE_HEIGHT}
            alignItems="center"
            justifyContent="center"
          >
            {/* Baseball, sketches in above center then slams down. */}
            <Animated.View
              style={{
                position: 'absolute',
                left: (STAGE_WIDTH - BASEBALL_SIZE.width) / 2,
                top: (STAGE_HEIGHT - BASEBALL_SIZE.height) / 2,
                width: BASEBALL_SIZE.width,
                height: BASEBALL_SIZE.height,
                opacity: ballOpacity,
                transform: [
                  { translateY: baseballFinalY },
                  { rotate: baseballRotate },
                  { scale: ballScale },
                ],
              }}
            >
              <BaseballSketch drawProgress={drawProgress} />
            </Animated.View>

            {/* Football, sketches in below center then slams up. */}
            <Animated.View
              style={{
                position: 'absolute',
                left: (STAGE_WIDTH - FOOTBALL_SIZE.width) / 2,
                top: (STAGE_HEIGHT - FOOTBALL_SIZE.height) / 2,
                width: FOOTBALL_SIZE.width,
                height: FOOTBALL_SIZE.height,
                opacity: ballOpacity,
                transform: [
                  { translateY: footballFinalY },
                  { rotate: footballRotate },
                  { scale: ballScale },
                ],
              }}
            >
              <FootballSketch drawProgress={drawProgress} />
            </Animated.View>

            {/* Impact flash + shockwave ring + sparks, centered on the slam point. */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: 220,
                height: 220,
                borderRadius: 999,
                backgroundColor: withAlpha(BRAND_GOLD_LIGHT, 0.55),
                opacity: flashOpacity,
                transform: [{ scale: flashScale }],
              }}
            />
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: 180,
                height: 180,
                borderRadius: 999,
                borderWidth: 2,
                borderColor: BRAND_GOLD,
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              }}
            />
            {SPARK_ANGLES.map((angle, i) => (
              <Animated.View
                key={angle}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  width: i % 2 ? 18 : 26,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: i % 3 === 2 ? BRAND_GOLD_LIGHT : BRAND_GOLD,
                  opacity: sparkOpacity,
                  transform: [
                    { rotate: `${angle}deg` },
                    { translateX: sparkTranslateX },
                  ],
                }}
              />
            ))}

            {/* Soft breathing glow behind the medallion during the Hold phase. */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: MEDALLION_SIZE + 60,
                height: MEDALLION_SIZE + 60,
                borderRadius: 999,
                backgroundColor: withAlpha(BRAND_GOLD, 0.35),
                opacity: Animated.multiply(medallionOpacity, glowOpacity),
              }}
            />

            {/* The real medallion bitmap, popping in at impact. */}
            <Animated.Image
              source={MEDALLION_SRC}
              resizeMode="contain"
              style={{
                position: 'absolute',
                width: MEDALLION_SIZE,
                height: MEDALLION_SIZE,
                opacity: medallionOpacity,
                transform: [{ scale: medallionScale }],
              }}
            />
          </YStack>

          {/* Wordmark lockup, stamps in beneath the medallion. */}
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
              <Animated.View style={{ opacity: subOpacity }}>
                <Text
                  fontFamily="$body"
                  fontWeight="600"
                  fontSize={13}
                  letterSpacing={5}
                  color="$textMuted"
                >
                  {'BASEBALL  ·  FOOTBALL'}
                </Text>
              </Animated.View>
            </YStack>
          </Animated.View>
        </Animated.View>
      </Theme>
    </Animated.View>
  );
}

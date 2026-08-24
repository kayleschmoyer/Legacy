import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { Text, Theme, YStack } from 'tamagui';
import { BrandLogo } from './BrandLogo';
import { BG_DARK, BRAND_GOLD, withAlpha } from '../../utils/colors';

/**
 * Timing per docs/design/brand.md § Navigation & Motion: reveal within the
 * 280–320ms ease-out band, micro fade-out, transform/opacity only. Total
 * overlay lifetime stays well under the ~1.2s cap agreed on LS-9464 so the
 * launch moment reads as polish, not a loading gate.
 */
export const LAUNCH_REVEAL_MS = 300;
export const LAUNCH_HOLD_MS = 400;
export const LAUNCH_FADE_OUT_MS = 150;
export const LAUNCH_TOTAL_MS =
  LAUNCH_REVEAL_MS + LAUNCH_HOLD_MS + LAUNCH_FADE_OUT_MS;

/**
 * Fail-safe for the `start` gate (LS-9728): if the caller never signals
 * `start` (e.g. `SplashScreen.hideAsync()` neither resolves nor rejects), the
 * choreography begins on its own after this delay so the overlay can never
 * hold the app hostage behind an opaque full-screen surface.
 */
export const LAUNCH_START_FAILSAFE_MS = 2000;

export interface AnimatedLaunchScreenProps {
  /** Called once the overlay has fully faded out; unmount it then. */
  onFinished?: () => void;
  /**
   * Visibility gate for the choreography (LS-9728). While `false`, the overlay
   * renders its initial frame (opaque field, reveal not yet begun) and none of
   * the timeline runs — pass `true` once the native splash has actually hidden
   * (`SplashScreen.hideAsync()` resolved), so the reveal cannot play unseen
   * behind the splash. Defaults to `true` for standalone use. The
   * `LAUNCH_START_FAILSAFE_MS` fail-safe begins the timeline anyway if the
   * signal never arrives.
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
  // BrandedSplash field so the native → JS handoff has no visible flash. This
  // surface is deliberately theme-independent — the native splash it hands off
  // from cannot be themed.
  backgroundColor: BG_DARK,
} as const;

/**
 * AnimatedLaunchScreen — full-screen branded launch animation shown once per
 * cold start of the mobile app, layered above the app UI immediately after the
 * static native splash hides (LS-9464). Fixed-length choreography: the gold
 * accent rule scales in and the wordmark lockup fades/translates up (~300ms
 * ease-out), holds briefly, then the whole overlay fades out and `onFinished`
 * fires.
 *
 * Cold-start-only gating is the *caller's* job via first-mount state (see
 * apps/app/src/app/_layout.tsx) — this component plays once, beginning when
 * the `start` prop turns true (or immediately on mount when it is omitted).
 * The timeline must not run on mount unconditionally: on a cold start the JS
 * tree commits while the native splash still covers the screen, and a
 * mount-anchored timeline plays partially or fully behind it (LS-9728).
 *
 * When the OS "Reduce Motion" setting is on, the reveal collapses to the final
 * frame and only the opacity-only fade-out runs, mirroring the brand rule of
 * crossfades-only under prefers-reduced-motion.
 */
export function AnimatedLaunchScreen({
  onFinished,
  start = true,
  testID = 'animated-launch-screen',
}: AnimatedLaunchScreenProps): React.JSX.Element {
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const ruleScale = useRef(new Animated.Value(0)).current;
  const lockupOpacity = useRef(new Animated.Value(0)).current;
  const lockupTranslate = useRef(new Animated.Value(8)).current;

  // Latches true when the caller signals visibility (or the fail-safe fires);
  // never returns to false, so the timeline below runs exactly once.
  const [begun, setBegun] = useState(start);

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

  // Keep the latest callback without retriggering the begin-once effect.
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    if (!begun) return;
    let cancelled = false;

    const reveal = (reduceMotion: boolean) => {
      if (cancelled) return;
      if (reduceMotion) {
        // Crossfade only: jump to the final frame — no positional movement.
        ruleScale.setValue(1);
        lockupOpacity.setValue(1);
        lockupTranslate.setValue(0);
        return;
      }
      Animated.parallel([
        Animated.timing(ruleScale, {
          toValue: 1,
          duration: LAUNCH_REVEAL_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(lockupOpacity, {
          toValue: 1,
          duration: LAUNCH_REVEAL_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(lockupTranslate, {
          toValue: 0,
          duration: LAUNCH_REVEAL_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    };

    // Mirror TabContentFade: honor the OS Reduce Motion setting, falling back
    // to the full reveal if it cannot be read.
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => reveal(reduceMotion))
      .catch(() => reveal(false));

    // Fixed-length timeline (independent of animation completion callbacks so
    // the overlay can never wedge on-screen if an animation is interrupted).
    const fadeTimer = setTimeout(() => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: LAUNCH_FADE_OUT_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, LAUNCH_REVEAL_MS + LAUNCH_HOLD_MS);
    const finishTimer = setTimeout(() => {
      onFinishedRef.current?.();
    }, LAUNCH_TOTAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [begun, overlayOpacity, ruleScale, lockupOpacity, lockupTranslate]);

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
            {/* Gold accent rule echoing the BrandedSplash / login card edge */}
            <Animated.View style={{ transform: [{ scaleX: ruleScale }] }}>
              <YStack
                width={48}
                height={2}
                borderRadius={2}
                backgroundColor={withAlpha(BRAND_GOLD, 0.65)}
              />
            </Animated.View>
            <Animated.View
              style={{
                opacity: lockupOpacity,
                transform: [{ translateY: lockupTranslate }],
              }}
            >
              <YStack alignItems="center" gap="$4">
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
        </YStack>
      </Theme>
    </Animated.View>
  );
}

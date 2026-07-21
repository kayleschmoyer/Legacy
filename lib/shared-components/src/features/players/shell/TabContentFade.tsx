import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import { YStack } from 'tamagui';
import { Animated, Platform } from '../../../platform-components';

// ── Tab content transition ──────────────────────────────────────────────────────

// Matches the web `ps-fadeIn` keyframe duration so both platforms crossfade alike.
const TAB_FADE_DURATION_MS = 140;

/**
 * Crossfades tab content when the active tab changes. Web relies on the
 * `ps-tabContent` CSS keyframe (which honors prefers-reduced-motion); native
 * has no CSS classes, so it fades opacity in via the Animated API — and honors
 * the OS "Reduce Motion" setting just as the web `@media (prefers-reduced-motion:
 * reduce)` rule does. Callers remount this via a `key` to retrigger the fade.
 */
export function TabContentFade({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const opacity = useRef(
    new Animated.Value(Platform.OS === 'web' ? 1 : 0),
  ).current;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    // Native-driver fade runs on the UI thread and never sets JS state, so no
    // teardown is required (matches the Animated usage across this library).
    const runFade = () => {
      if (cancelled) return;
      Animated.timing(opacity, {
        toValue: 1,
        duration: TAB_FADE_DURATION_MS,
        useNativeDriver: true,
      }).start();
    };
    // Mirror web's prefers-reduced-motion bypass: when the OS "Reduce Motion"
    // setting is on, show content immediately instead of fading. Fall back to
    // the fade if the setting can't be read.
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled) return;
        if (reduceMotion) {
          opacity.setValue(1);
        } else {
          runFade();
        }
      })
      .catch(runFade);
    return () => {
      cancelled = true;
    };
  }, [opacity]);

  if (Platform.OS === 'web') {
    return <YStack className="ps-tabContent">{children}</YStack>;
  }

  // Native-only Animated.View: `opacity` is an Animated.Value, not web CSS, so it
  // must NOT go through csp() (whose CSSProperties constraint rejects the animated
  // value). No web-only style keys here — this path never runs on web.
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

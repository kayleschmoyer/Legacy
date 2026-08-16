/**
 * DraftPickSplashConfetti (native) — the confetti burst for the Draft Room
 * v2 my-pick splash (LS-9402) README "My-pick splash (overlay)": ~26 pieces,
 * brand palette, fall ~660px with 720° rotation over ~2.1s, staggered up to
 * ~0.55s. Adapted from DraftPickAnnouncement.native.tsx's Confetti (same
 * react-native Animated approach — no web build, see ./DraftPickSplashConfetti.tsx
 * for the capability shim).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { YStack } from 'tamagui';
import { SPLASH_CONFETTI_COLORS } from './constants';

const PIECE_COUNT = 26;
const FALL_DISTANCE = 660;
const DURATION_MS = 2100;
const MAX_STAGGER_MS = 550;

interface ConfettiPiece {
  key: string;
  /** Horizontal start, as the percentage string RN's ViewStyle requires. */
  left: `${number}%`;
  color: string;
  /** Fraction of the burst to wait before this piece starts falling. */
  delay: number;
}

/** Deterministic-per-burst confetti geometry; regenerated on each pick. */
function useConfettiGeometry(seed: number): ConfettiPiece[] {
  return useMemo(
    () =>
      Array.from(
        { length: PIECE_COUNT },
        (_, i): ConfettiPiece => ({
          key: `${seed}-${i}`,
          left: `${Math.round(Math.random() * 100)}%`,
          color: SPLASH_CONFETTI_COLORS[i % SPLASH_CONFETTI_COLORS.length],
          delay: (Math.random() * MAX_STAGGER_MS) / DURATION_MS,
        }),
      ),
    [seed],
  );
}

export interface DraftPickSplashConfettiProps {
  /** Regenerates the burst's geometry — pass the overall pick number so each new my-pick gets a fresh scatter. */
  seed: number;
}

export function DraftPickSplashConfetti({
  seed,
}: DraftPickSplashConfettiProps): React.JSX.Element {
  const progress = useRef(new Animated.Value(0)).current;
  const pieces = useConfettiGeometry(seed);

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, seed]);

  return (
    <YStack
      testID="draft-pick-splash-confetti"
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={60}
      overflow="hidden"
      pointerEvents="none"
    >
      {pieces.map((piece) => {
        // Each piece runs over [delay, 1]; before its delay the interpolation
        // clamps, holding it off-screen at the top.
        const range = [piece.delay, 1];
        return (
          <Animated.View
            key={piece.key}
            style={{
              position: 'absolute',
              left: piece.left,
              top: -14,
              width: 7,
              height: 11,
              borderRadius: 2,
              backgroundColor: piece.color,
              opacity: progress.interpolate({
                inputRange: [0, 0.75, 1],
                outputRange: [0.95, 0.95, 0.3],
              }),
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: range,
                    outputRange: [0, FALL_DISTANCE],
                    extrapolate: 'clamp',
                  }),
                },
                {
                  rotate: progress.interpolate({
                    inputRange: range,
                    outputRange: ['0deg', '720deg'],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            }}
          />
        );
      })}
    </YStack>
  );
}

export default DraftPickSplashConfetti;

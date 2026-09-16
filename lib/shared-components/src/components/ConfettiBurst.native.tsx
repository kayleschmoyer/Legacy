/**
 * ConfettiBurst (native) — ~26 pieces falling ~660px with 720° rotation over
 * ~2.1s, staggered up to ~0.55s. See ./ConfettiBurst.tsx for the web
 * capability shim (react-native's Animated API has no web build here).
 *
 * The geometry originated in the Draft Room v2 my-pick splash (LS-9402) and
 * was generalised here by LS-10111 for the matchup scoreboard's touchdown
 * celebration. LS-10205 has since replaced the draft splash with an
 * announcement card, so the scoreboard is currently the only caller — the
 * component stays palette-agnostic for the next one.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { YStack } from 'tamagui';

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

/** Deterministic-per-burst confetti geometry; regenerated on each seed change. */
function useConfettiGeometry(
  seed: number,
  colors: readonly string[],
): ConfettiPiece[] {
  return useMemo(
    () =>
      Array.from(
        { length: PIECE_COUNT },
        (_, i): ConfettiPiece => ({
          key: `${seed}-${i}`,
          left: `${Math.round(Math.random() * 100)}%`,
          color: colors[i % colors.length],
          delay: (Math.random() * MAX_STAGGER_MS) / DURATION_MS,
        }),
      ),
    [seed, colors],
  );
}

export interface ConfettiBurstProps {
  /** Regenerates the burst's geometry — pass a value that changes per celebration. */
  seed: number;
  /** Palette the pieces cycle through. */
  colors: readonly string[];
  /** Test hook for platform E2E/unit assertions. */
  testID?: string;
  /** Stacking order above the celebrating surface. */
  zIndex?: number;
}

export function ConfettiBurst({
  seed,
  colors,
  testID = 'confetti-burst',
  zIndex = 60,
}: ConfettiBurstProps): React.JSX.Element | null {
  const progress = useRef(new Animated.Value(0)).current;
  const pieces = useConfettiGeometry(seed, colors);

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
      testID={testID}
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={zIndex}
      overflow="hidden"
      pointerEvents="none"
      // Decorative only: the celebrating surface announces the event itself.
      aria-hidden
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

export default ConfettiBurst;

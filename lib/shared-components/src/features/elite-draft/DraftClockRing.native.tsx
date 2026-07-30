/**
 * DraftClockRing (native) — the circular pick countdown in the draft header.
 *
 * A track ring plus a stroke-dashoffset progress ring that drains clockwise as
 * the pick clock runs down, with the remaining time centred inside it. When the
 * viewer is on the clock the whole ring breathes so it reads from across the
 * room.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { Text, YStack } from 'tamagui';
import Svg, { Circle } from 'react-native-svg';
import { formatClock } from './nativeDraftBoard';
import { clockToneFor, useDraftPalette } from './nativeDraftPalette';

const VIEWBOX = 62;
const RADIUS = 26;
const STROKE = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface DraftClockRingProps {
  /** Seconds left on the current pick. */
  secondsRemaining: number;
  /** Seconds the pick started with — the denominator for the arc. */
  totalSeconds: number;
  /** The viewer is on the clock: pulse the ring. */
  emphasize?: boolean;
  /** Commissioner has paused the draft — show `PAUSE` instead of a countdown. */
  paused?: boolean;
  /** Outer diameter in px. Default 52. */
  size?: number;
}

export function DraftClockRing({
  secondsRemaining,
  totalSeconds,
  emphasize = false,
  paused = false,
  size = 52,
}: DraftClockRingProps): React.JSX.Element {
  const palette = useDraftPalette();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!emphasize || paused) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [emphasize, paused, pulse]);

  const tone = paused ? 'warning' : clockToneFor(secondsRemaining);
  const strokeColor = palette.clock[tone];

  // Guard against a zero/absent limit so the arc never renders NaN.
  const fraction =
    totalSeconds > 0
      ? Math.min(1, Math.max(0, secondsRemaining / totalSeconds))
      : 0;
  const dashOffset = CIRCUMFERENCE * (1 - fraction);
  const label = paused ? 'PAUSE' : formatClock(secondsRemaining);

  return (
    <Animated.View
      accessibilityRole="timer"
      accessibilityLabel={
        paused
          ? 'Draft paused'
          : `${formatClock(secondsRemaining)} left on the clock`
      }
      style={{
        width: size,
        height: size,
        transform: [
          {
            scale: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.08],
            }),
          },
        ],
      }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
        <Circle
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={RADIUS}
          fill="none"
          stroke={palette.surface.panelBorder}
          strokeWidth={STROKE}
        />
        <Circle
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${VIEWBOX / 2} ${VIEWBOX / 2})`}
        />
      </Svg>
      <YStack
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        alignItems="center"
        justifyContent="center"
      >
        <Text
          fontFamily="$heading"
          fontSize={paused ? 11 : 14}
          fontWeight="700"
          color={strokeColor}
        >
          {label}
        </Text>
      </YStack>
    </Animated.View>
  );
}

export default DraftClockRing;

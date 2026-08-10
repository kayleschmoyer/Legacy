/**
 * DraftClockRing (web) — the circular pick countdown in the draft header.
 *
 * A track ring plus a stroke-dashoffset progress ring that drains clockwise as
 * the pick clock runs down, with the remaining time centred inside it. This is
 * a capability shim of ./DraftClockRing.native.tsx: react-native-svg has no web
 * build in this codebase, so the ring is a plain DOM `<svg>` instead (same
 * technique as the icons in DraftPlayerBoard.tsx). Simplification: the ring is
 * static rather than pulsing when the viewer is on the clock — react-native's
 * Animated API has no equivalent-effort DOM primitive in scope for this ticket
 * (LS-9206); `emphasize` still drives a static glow so the state reads clearly.
 */
import React from 'react';
import { Text, YStack } from 'tamagui';
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
  /** Offline mock draft mode (LS-9144) — show `∞` instead of a countdown. */
  untimed?: boolean;
  /** Outer diameter in px. Default 52. */
  size?: number;
}

export function DraftClockRing({
  secondsRemaining,
  totalSeconds,
  emphasize = false,
  paused = false,
  untimed = false,
  size = 52,
}: DraftClockRingProps): React.JSX.Element {
  const palette = useDraftPalette();

  const tone = paused
    ? 'warning'
    : untimed
      ? 'calm'
      : clockToneFor(secondsRemaining);
  const strokeColor = palette.clock[tone];

  // Guard against a zero/absent limit so the arc never renders NaN.
  const fraction = untimed
    ? 1
    : totalSeconds > 0
      ? Math.min(1, Math.max(0, secondsRemaining / totalSeconds))
      : 0;
  const dashOffset = CIRCUMFERENCE * (1 - fraction);
  const label = untimed
    ? '∞'
    : paused
      ? 'PAUSE'
      : formatClock(secondsRemaining);

  return (
    <YStack
      role="timer"
      aria-label={
        untimed
          ? 'No pick time limit'
          : paused
            ? 'Draft paused'
            : `${formatClock(secondsRemaining)} left on the clock`
      }
      width={size}
      height={size}
      style={
        emphasize && !paused && !untimed
          ? { filter: `drop-shadow(0 0 6px ${strokeColor})` }
          : undefined
      }
    >
      <svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
        <circle
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={RADIUS}
          fill="none"
          stroke={palette.surface.panelBorder}
          strokeWidth={STROKE}
        />
        <circle
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
      </svg>
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
    </YStack>
  );
}

export default DraftClockRing;

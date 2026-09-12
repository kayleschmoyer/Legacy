import React from 'react';
import { useReducedMotion } from './useReducedMotion';

export interface UseAnimatedNumberOptions {
  /** Tween duration in milliseconds. Defaults to 700ms. */
  durationMs?: number;
  /**
   * Called once per settled increase with the signed delta (new - previous).
   * Only fires for changes after the first render — the initial value is the
   * baseline, not an increment, so mounting a scoreboard never reports a jump
   * from zero.
   */
  onDelta?: (delta: number) => void;
  /**
   * Skip tweening and track `value` instantly. Callers pass this when the
   * surface is not live (a completed matchup re-rendering from cache, say),
   * so a static score never animates on mount.
   */
  disabled?: boolean;
}

export interface AnimatedNumberState {
  /** The current tweened value — equals `value` once the tween settles. */
  current: number;
  /**
   * The most recent increase, or `null` when no increase is in flight. Held
   * for the duration of the tween so callers can render a "+N" flourish
   * alongside the counting digits, then cleared.
   */
  delta: number | null;
}

const DEFAULT_DURATION_MS = 700;

/** easeOutCubic — fast start, gentle settle. Matches the scoreboard's feel. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Tweens a number toward `value` instead of replacing it instantly, and
 * reports each increase as a delta (LS-6392 / FMD-012).
 *
 * This is the animation engine behind the matchup scoreboard's score counter.
 * It is deliberately a hook rather than an `<AnimatedNumber>` wrapper
 * component: the scoreboard's score is rendered by an already-styled Tamagui
 * `Text` carrying pace colouring, tabular figures and its own ARIA labelling,
 * and a wrapper component would either have to re-implement that styling or
 * accept it back through props. A hook drives the existing element in place,
 * so no styling or accessibility behaviour moves.
 *
 * Cross-platform: uses `requestAnimationFrame` only, which both the browser
 * and React Native provide. It renders nothing and touches no DOM, so it is
 * safe in shared components consumed by `apps/web` and `apps/app` alike.
 *
 * Honors `prefers-reduced-motion`: reduced-motion users jump straight to the
 * new value (and still get the delta callback, so a non-motion affordance
 * such as a badge or announcement is unaffected).
 */
export function useAnimatedNumber(
  value: number,
  options: UseAnimatedNumberOptions = {},
): AnimatedNumberState {
  const {
    durationMs = DEFAULT_DURATION_MS,
    onDelta,
    disabled = false,
  } = options;
  const reducedMotion = useReducedMotion();
  const snapToValue = disabled || reducedMotion || durationMs <= 0;

  const [current, setCurrent] = React.useState(value);
  const [delta, setDelta] = React.useState<number | null>(null);

  // Refs keep the animation loop stable across renders: reading the previous
  // value and the latest onDelta from refs means a re-render mid-tween does
  // not restart it or fire a stale callback.
  const previousRef = React.useRef(value);
  const frameRef = React.useRef<number | null>(null);
  const onDeltaRef = React.useRef(onDelta);
  onDeltaRef.current = onDelta;

  React.useEffect(() => {
    const from = previousRef.current;
    if (from === value) return;

    previousRef.current = value;
    const difference = value - from;
    if (difference > 0) {
      setDelta(difference);
      onDeltaRef.current?.(difference);
    } else {
      // A correction downward (stat re-scoring) is not an increment — clear
      // any in-flight badge rather than showing a negative "+N".
      setDelta(null);
    }

    if (snapToValue || typeof requestAnimationFrame !== 'function') {
      setCurrent(value);
      return;
    }

    const start = Date.now();
    const step = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / durationMs, 1);
      setCurrent(from + difference * easeOutCubic(progress));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }
      frameRef.current = null;
      // Land exactly on the target — easing math must never leave the
      // displayed score a fraction off the real one.
      setCurrent(value);
    };
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [value, durationMs, snapToValue]);

  // Clear the delta once the increase has had time to read, independently of
  // the tween so reduced-motion users still see the badge briefly.
  React.useEffect(() => {
    if (delta == null) return;
    const timer = setTimeout(
      () => setDelta(null),
      Math.max(durationMs, DEFAULT_DURATION_MS) + 900,
    );
    return () => clearTimeout(timer);
  }, [delta, durationMs]);

  return { current, delta };
}

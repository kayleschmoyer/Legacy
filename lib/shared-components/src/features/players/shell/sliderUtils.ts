// Pure helpers backing the advanced stat-range sliders. Extracted from the
// baseball `PlayerStatsPage.tsx` monolith so the sport-agnostic `StatSlider`
// (and both sport configs) can share them without importing the page shell.
//
// These are re-exported from `PlayerStatsPage.tsx` to preserve the public API
// that unit specs import (`sliderFillPct`, `parseSliderValue`, `stepValue`,
// `createDebouncedCommit`, `SLIDER_COMMIT_DEBOUNCE_MS`).

/**
 * Computes a slider's fill percentage (0–100) for `value` within `[min, max]`.
 * Guards the denominator: when `max <= min` the range is degenerate (a future
 * config bug could pass `max === min`), so the naive `(value - min) / (max - min)`
 * would divide by zero and yield `NaN`/`Infinity` — which renders as the invalid
 * CSS length `NaN%` (silently dropped by Chrome, treated as `0%` by Firefox).
 * Defaults to `0` in that case and clamps the result to `[0, 100]` so the fill
 * width is always a valid percentage. Extracted as a pure function so the
 * arithmetic is unit-testable without mounting the page (LS-7134).
 */
export function sliderFillPct(value: number, min: number, max: number): number {
  const range = max - min;
  if (range <= 0) {
    return 0;
  }
  const pct = Math.round(((value - min) / range) * 100);
  return Math.min(100, Math.max(0, pct));
}

/**
 * Parses a raw range-input value into a finite number, rejecting `NaN`/±Infinity
 * at the setter boundary. Browser range inputs are well-behaved, but malformed
 * states (e.g. the value cleared via devtools) can yield `Number('') === 0` or a
 * `NaN` that would otherwise propagate into filter state and on toward GraphQL.
 * Returns `null` for any non-finite parse so callers can ignore the change and
 * keep the prior valid value (LS-7137). Extracted as a pure function so the guard
 * is unit-testable without mounting the page.
 */
export function parseSliderValue(raw: string): number | null {
  const next = Number(raw);
  return Number.isFinite(next) ? next : null;
}

/**
 * Advances a numeric range value by `delta` steps, snapping to the `step` grid
 * and clamping to `[min, max]`. Snapping avoids floating-point drift on
 * fractional steps (e.g. batting-average 0.005 increments). Extracted as a pure
 * function so the native stepper's arithmetic is unit-testable without mounting
 * the page (LS-7806).
 */
export function stepValue(
  value: number,
  delta: number,
  min: number,
  max: number,
  step: number,
): number {
  const next = value + delta;
  const snapped = Math.round(next / step) * step;
  const clamped = Math.min(max, Math.max(min, snapped));
  // Re-snap after clamping so min/max that aren't on the step grid stay exact.
  return Number(clamped.toFixed(6));
}

/**
 * Slider commits are debounced by this many ms. A fast drag or a held arrow key
 * (`onKeyUp` fires once per keystroke) would otherwise commit — and remount the
 * grid + refire the GraphQL query — once per keystroke (LS-7128 / PST-062).
 */
export const SLIDER_COMMIT_DEBOUNCE_MS = 250;

export interface DebouncedCommit {
  /**
   * Schedule a commit `delayMs` after the most recent call, replacing any
   * still-pending commit so a burst of calls collapses into one.
   */
  trigger: () => void;
  /** Fire a pending commit immediately; no-op when nothing is pending. */
  flush: () => void;
  /** Drop any pending commit without firing it. */
  cancel: () => void;
}

/**
 * Wraps `commit` in a trailing-edge debounce. The slider previously bound
 * `applyFilters` straight to `onKeyUp`/`onMouseUp`/`onTouchEnd`, so holding an
 * arrow key fired one commit — one grid remount + GraphQL refetch — per
 * keystroke (LS-7128). Routing the keyboard path through `trigger` collapses a
 * burst of keyups into a single commit, while `flush` lets a terminal event
 * (blur) commit a pending value without waiting out the delay. Extracted as a
 * pure factory so the coalescing is unit-testable without mounting the page.
 */
export function createDebouncedCommit(
  commit: () => void,
  delayMs: number = SLIDER_COMMIT_DEBOUNCE_MS,
): DebouncedCommit {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    trigger: () => {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        commit();
      }, delayMs);
    },
    flush: () => {
      if (timer !== null) {
        cancel();
        commit();
      }
    },
    cancel,
  };
}

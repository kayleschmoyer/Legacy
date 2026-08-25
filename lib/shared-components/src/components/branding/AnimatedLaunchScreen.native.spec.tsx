/**
 * AnimatedLaunchScreen.native (LS-9747) — cold-start "Slam" launch
 * choreography: baseball + football sketch in, slam together at center,
 * burst into the medallion bitmap, wordmark stamps in, hold, fade.
 *
 * Under test:
 *  - renders the medallion, wordmark, and sub-line on the #0A0F1A field
 *  - fixed-length phase timeline: draw -> collide -> impact -> stamp ->
 *    hold -> fade -> onFinished, scheduled independently of the
 *    Reduce-Motion check (jest fake timers)
 *  - both sketches finish drawing before the pull-back begins (AC2)
 *  - Reduce Motion collapses straight to the final frame (real logo bitmap +
 *    wordmark + sub-line, no sketch/slam/stamp/flash/kick) and runs only
 *    the opacity-only fade-out
 *  - start gating + LAUNCH_START_FAILSAFE_MS fail-safe (LS-9728 contract)
 *  - nothing but the opaque field renders before the timeline begins — no
 *    static logo can flash on screen (AC5)
 *  - unmount before completion never fires onFinished (cleanup)
 *  - only transform/opacity are animated on plain Views (brand motion rule).
 *    SVG stroke-dashoffset (the documented AC3 exception for the sketch
 *    reveal) isn't asserted here: react-native-svg's Circle/Path/Line are
 *    covered by the shared jest-setup-mobile.js mock, which doesn't
 *    instrument props the way this file's own Animated.View/Image mocks do —
 *    verified by code review + on-device QA instead.
 *
 * Ships its own minimal react-native mock — the same pattern as
 * AnimatedLaunchScreen.spec.tsx (web) and PickSplashStatGraphic.native.spec.tsx.
 * react-native-svg is covered by the global mock in jest-setup-mobile.js.
 */
import React from 'react';
import { act } from '@testing-library/react';
import {
  AnimatedLaunchScreen,
  LAUNCH_COLLIDE_MS,
  LAUNCH_DRAW_MS,
  LAUNCH_FADE_OUT_MS,
  LAUNCH_FADE_OUT_OFFSET_MS,
  LAUNCH_HOLD_MS,
  LAUNCH_IMPACT_OFFSET_MS,
  LAUNCH_STAMP_MS,
  LAUNCH_START_FAILSAFE_MS,
  LAUNCH_TOTAL_MS,
} from './AnimatedLaunchScreen.native';
import { render } from '../../test-utils';

// The component renders extra literal spaces around the dot (RN Text
// doesn't collapse whitespace); RTL's getByText normalizes/collapses
// whitespace when matching, so the query string uses single spaces.
const SUB_LINE = 'BASEBALL · FOOTBALL';

jest.mock('react-native', () => {
  class MockAnimatedValue {
    value: number;
    setValue: (next: number) => void;
    interpolate: () => MockAnimatedValue;
    constructor(value: number) {
      this.value = value;
      this.setValue = (next: number) => {
        this.value = next;
      };
      this.interpolate = () => this;
    }
  }

  // A composite node (Animated.add/multiply result) — chainable like a real
  // AnimatedAddition/AnimatedMultiplication, which also expose .interpolate().
  const makeCompositeNode = (op: string, args: unknown[]) => {
    const node = { _op: op, args, interpolate: () => node };
    return node;
  };

  // Every animated style/prop object handed to a mocked Animated component is
  // recorded here so tests can assert which keys carry animated values.
  const animatedNodes: unknown[] = [];
  const timingCalls: { config: Record<string, unknown> }[] = [];
  const loopCalls: unknown[] = [];

  const makeController = () => ({
    start: jest.fn((cb?: () => void) => cb?.()),
    stop: jest.fn(),
    reset: jest.fn(),
  });

  const AnimatedView = ({
    children,
    style,
    testID,
  }: {
    children?: React.ReactNode;
    style?: unknown;
    testID?: string;
  }) => {
    animatedNodes.push(style);
    return <div data-testid={testID}>{children}</div>;
  };

  const AnimatedImageMock = ({ style }: { style?: unknown }) => {
    animatedNodes.push(style);
    return <div data-testid="animated-logo-image" />;
  };

  let reduceMotionEnabled = false;

  return {
    Animated: {
      Value: MockAnimatedValue,
      View: AnimatedView,
      Image: AnimatedImageMock,
      createAnimatedComponent: (Component: unknown) => Component,
      multiply: (...args: unknown[]) => makeCompositeNode('multiply', args),
      add: (...args: unknown[]) => makeCompositeNode('add', args),
      timing: jest.fn(
        (_value: MockAnimatedValue, config: Record<string, unknown>) => {
          timingCalls.push({ config });
          return makeController();
        },
      ),
      delay: jest.fn(() => makeController()),
      parallel: jest.fn((animations: { start: jest.Mock }[]) => ({
        start: jest.fn(() => {
          animations.forEach((a) => {
            a.start();
          });
        }),
        stop: jest.fn(),
        reset: jest.fn(),
      })),
      sequence: jest.fn((animations: { start: jest.Mock }[]) => ({
        start: jest.fn((cb?: () => void) => {
          animations.forEach((a) => {
            a.start();
          });
          cb?.();
        }),
        stop: jest.fn(),
      })),
      loop: jest.fn((animation: unknown) => {
        loopCalls.push(animation);
        return makeController();
      }),
    },
    Easing: {
      out: jest.fn((easing: unknown) => easing),
      in: jest.fn((easing: unknown) => easing),
      inOut: jest.fn((easing: unknown) => easing),
      linear: jest.fn(),
      quad: jest.fn(),
      cubic: jest.fn(),
      sin: jest.fn(),
      back: jest.fn(() => jest.fn()),
    },
    Image: ({ style }: { style?: unknown }) => {
      animatedNodes.push(style);
      return <div data-testid="static-logo-image" />;
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: jest.fn(() =>
        Promise.resolve(reduceMotionEnabled),
      ),
    },
    // Non-standard exports so tests can reach the recorded state.
    _animatedNodes: animatedNodes,
    _timingCalls: timingCalls,
    _loopCalls: loopCalls,
    _setReduceMotion: (enabled: boolean) => {
      reduceMotionEnabled = enabled;
    },
  };
});

interface MockedReactNative {
  Animated: { timing: jest.Mock; parallel: jest.Mock; loop: jest.Mock };
  AccessibilityInfo: { isReduceMotionEnabled: jest.Mock };
  _animatedNodes: unknown[];
  _timingCalls: { config: Record<string, unknown> }[];
  _loopCalls: unknown[];
  _setReduceMotion: (enabled: boolean) => void;
}

function getMock(): MockedReactNative {
  return jest.requireMock<MockedReactNative>('react-native');
}

/** Flush the AccessibilityInfo.isReduceMotionEnabled() microtask. */
async function flushReduceMotionRead(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Collect the style/prop keys that carry animated (MockAnimatedValue) values. */
function collectAnimatedKeys(): Set<string> {
  const keys = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'transform' && Array.isArray(value)) {
        keys.add('transform');
        continue;
      }
      if (
        value &&
        typeof value === 'object' &&
        ('setValue' in value || '_op' in value)
      ) {
        keys.add(key);
      }
    }
  };
  getMock()._animatedNodes.forEach(visit);
  return keys;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  getMock()._animatedNodes.length = 0;
  getMock()._timingCalls.length = 0;
  getMock()._loopCalls.length = 0;
  getMock()._setReduceMotion(false);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AnimatedLaunchScreen (native)', () => {
  it('renders the medallion, wordmark, and sub-line on the launch field', async () => {
    const { getByText, queryByTestId } = render(<AnimatedLaunchScreen />);
    await flushReduceMotionRead();

    expect(queryByTestId('animated-launch-screen')).toBeTruthy();
    expect(getByText('LEGACY SPORTS')).toBeTruthy();
    expect(getByText(SUB_LINE)).toBeTruthy();
  });

  it('renders nothing but the opaque field before the timeline begins (no logo flash)', () => {
    const { queryByTestId, queryByText } = render(
      <AnimatedLaunchScreen start={false} />,
    );

    expect(queryByTestId('animated-launch-screen')).toBeTruthy();
    expect(queryByText('LEGACY SPORTS')).toBeNull();
    expect(queryByText(SUB_LINE)).toBeNull();
    expect(getMock()._timingCalls).toHaveLength(0);
  });

  it('runs draw -> collide -> impact -> stamp -> hold -> fade as a fixed-length timeline, onFinished once at the total', async () => {
    const onFinished = jest.fn();
    render(<AnimatedLaunchScreen onFinished={onFinished} />);
    await flushReduceMotionRead();

    // Draw: one linear timing over LAUNCH_DRAW_MS, plus the ball slide/enter
    // timings and the bob + wobble idle loops.
    expect(
      getMock()._timingCalls.some(
        (c) => c.config['duration'] === LAUNCH_DRAW_MS,
      ),
    ).toBe(true);
    expect(getMock()._loopCalls).toHaveLength(2);
    getMock()._timingCalls.length = 0;

    // Nothing collide-related fires until LAUNCH_DRAW_MS has fully
    // elapsed — both sketches finish their dash-reveal before the
    // pull-back begins (AC2).
    act(() => {
      jest.advanceTimersByTime(LAUNCH_DRAW_MS - 1);
    });
    expect(getMock()._timingCalls).toHaveLength(0);

    // Collide phase starts exactly at LAUNCH_DRAW_MS: anticipation
    // pull-back (160ms) + rush-to-center (240ms) on the position driver,
    // plus the rush-spin timing (240ms).
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(getMock()._timingCalls).toHaveLength(3);
    expect(
      getMock()._timingCalls.filter((c) => c.config['duration'] === 160),
    ).toHaveLength(1);
    expect(
      getMock()._timingCalls.filter((c) => c.config['duration'] === 240),
    ).toHaveLength(2);
    expect(onFinished).not.toHaveBeenCalled();
    getMock()._timingCalls.length = 0;

    // Impact lands at LAUNCH_DRAW_MS + LAUNCH_IMPACT_OFFSET_MS = 1.70s:
    // flash, ring, medallion opacity/pop, and the camera-kick decay.
    act(() => {
      jest.advanceTimersByTime(LAUNCH_IMPACT_OFFSET_MS);
    });
    expect(getMock()._timingCalls).toHaveLength(5);
    expect(
      getMock()._timingCalls.some((c) => c.config['duration'] === 520),
    ).toBe(true); // medallion pop, ease-out-back
    getMock()._timingCalls.length = 0;

    // Stamp: the wordmark stamps in 80ms into the Stamp phase
    // (LAUNCH_DRAW_MS + LAUNCH_COLLIDE_MS + 80 = 2.18s).
    act(() => {
      jest.advanceTimersByTime(
        LAUNCH_COLLIDE_MS - LAUNCH_IMPACT_OFFSET_MS + 80,
      );
    });
    expect(getMock()._timingCalls).toHaveLength(4);
    expect(
      getMock()._timingCalls.some((c) => c.config['duration'] === 600),
    ).toBe(true); // wordmark pop, ease-out-back
    getMock()._timingCalls.length = 0;

    // Hold begins at LAUNCH_DRAW_MS + LAUNCH_COLLIDE_MS + LAUNCH_STAMP_MS =
    // 3.00s: the medallion breathing loop starts.
    act(() => {
      jest.advanceTimersByTime(LAUNCH_STAMP_MS - 80);
    });
    expect(getMock()._loopCalls).toHaveLength(3);
    expect(onFinished).not.toHaveBeenCalled();
    getMock()._timingCalls.length = 0;

    // Overlay fade starts LAUNCH_FADE_OUT_OFFSET_MS into the Hold phase.
    act(() => {
      jest.advanceTimersByTime(LAUNCH_FADE_OUT_OFFSET_MS);
    });
    expect(
      getMock()._timingCalls.some(
        (c) => c.config['duration'] === LAUNCH_FADE_OUT_MS,
      ),
    ).toBe(true);
    expect(onFinished).not.toHaveBeenCalled();

    // onFinished fires exactly once, at the total lifetime.
    act(() => {
      jest.advanceTimersByTime(LAUNCH_HOLD_MS - LAUNCH_FADE_OUT_OFFSET_MS);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(LAUNCH_TOTAL_MS);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('animates only transform/opacity on Views (brand motion rule)', async () => {
    render(<AnimatedLaunchScreen />);
    await flushReduceMotionRead();
    act(() => {
      jest.advanceTimersByTime(LAUNCH_TOTAL_MS);
    });

    const animatedKeys = collectAnimatedKeys();
    expect(animatedKeys.size).toBeGreaterThan(0);
    for (const key of animatedKeys) {
      expect(['opacity', 'transform']).toContain(key);
    }
  });

  it('collapses to the final frame (real logo + wordmark + sub-line) when reduce motion is enabled', async () => {
    getMock()._setReduceMotion(true);
    const onFinished = jest.fn();
    render(<AnimatedLaunchScreen onFinished={onFinished} />);
    await flushReduceMotionRead();

    // No draw/collide/impact/stamp timings or idle loops — the reveal
    // jumps straight to the final frame.
    expect(
      getMock()._timingCalls.some(
        (c) => c.config['duration'] === LAUNCH_DRAW_MS,
      ),
    ).toBe(false);
    expect(getMock()._loopCalls).toHaveLength(0);

    // The opacity-only fade-out still runs on the same fixed schedule.
    act(() => {
      jest.advanceTimersByTime(
        LAUNCH_DRAW_MS +
          LAUNCH_COLLIDE_MS +
          LAUNCH_STAMP_MS +
          LAUNCH_FADE_OUT_OFFSET_MS,
      );
    });
    expect(
      getMock()._timingCalls.filter(
        (c) => c.config['duration'] === LAUNCH_FADE_OUT_MS,
      ),
    ).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(
        LAUNCH_TOTAL_MS -
          (LAUNCH_DRAW_MS +
            LAUNCH_COLLIDE_MS +
            LAUNCH_STAMP_MS +
            LAUNCH_FADE_OUT_OFFSET_MS),
      );
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('holds the timeline until start turns true (LS-9728)', async () => {
    const onFinished = jest.fn();
    const { rerender } = render(
      <AnimatedLaunchScreen start={false} onFinished={onFinished} />,
    );

    expect(getMock()._timingCalls).toHaveLength(0);

    act(() => {
      jest.advanceTimersByTime(LAUNCH_TOTAL_MS);
    });
    expect(getMock()._timingCalls).toHaveLength(0);
    expect(onFinished).not.toHaveBeenCalled();

    rerender(<AnimatedLaunchScreen start onFinished={onFinished} />);
    await flushReduceMotionRead();
    expect(
      getMock()._timingCalls.some(
        (c) => c.config['duration'] === LAUNCH_DRAW_MS,
      ),
    ).toBe(true);

    act(() => {
      jest.advanceTimersByTime(LAUNCH_TOTAL_MS);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('begins on its own after the fail-safe when start never arrives (LS-9728)', async () => {
    const onFinished = jest.fn();
    render(<AnimatedLaunchScreen start={false} onFinished={onFinished} />);
    expect(getMock()._timingCalls).toHaveLength(0);

    act(() => {
      jest.advanceTimersByTime(LAUNCH_START_FAILSAFE_MS);
    });
    await flushReduceMotionRead();
    expect(
      getMock()._timingCalls.some(
        (c) => c.config['duration'] === LAUNCH_DRAW_MS,
      ),
    ).toBe(true);

    act(() => {
      jest.advanceTimersByTime(LAUNCH_TOTAL_MS);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('never fires onFinished after unmount (cleanup)', async () => {
    const onFinished = jest.fn();
    const { unmount } = render(
      <AnimatedLaunchScreen onFinished={onFinished} />,
    );
    await flushReduceMotionRead();

    unmount();
    act(() => {
      jest.advanceTimersByTime(LAUNCH_TOTAL_MS * 2);
    });
    expect(onFinished).not.toHaveBeenCalled();
  });
});

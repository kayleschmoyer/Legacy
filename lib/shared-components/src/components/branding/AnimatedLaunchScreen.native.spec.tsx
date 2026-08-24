/**
 * AnimatedLaunchScreen.native (LS-9746) — cold-start draw -> punch-in ->
 * stamp launch choreography.
 *
 * Under test:
 *  - renders the medallion SVG + wordmark lockup on the #0A0F1A field
 *  - fixed-length phase timeline: draw -> punch -> stamp -> fade -> onFinished,
 *    scheduled independently of the Reduce-Motion check (jest fake timers)
 *  - Reduce Motion collapses straight to the final frame (real logo bitmap +
 *    wordmark, no sketch/punch/stamp/flash/kick) and runs only the
 *    opacity-only fade-out
 *  - start gating + LAUNCH_START_FAILSAFE_MS fail-safe (LS-9728 contract,
 *    preserved from the web component)
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
  LAUNCH_DRAW_MS,
  LAUNCH_FADE_OUT_MS,
  LAUNCH_PUNCH_MS,
  LAUNCH_STAMP_MS,
  LAUNCH_START_FAILSAFE_MS,
  LAUNCH_TOTAL_MS,
} from './AnimatedLaunchScreen.native';
import { render } from '../../test-utils';

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

  // Every animated style/prop object handed to a mocked Animated component is
  // recorded here so tests can assert which keys carry animated values.
  const animatedNodes: unknown[] = [];
  const timingCalls: { config: Record<string, unknown> }[] = [];
  const loopCalls: unknown[] = [];

  const makeController = () => ({
    start: jest.fn(),
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
      multiply: (...args: unknown[]) => ({ _op: 'multiply', args }),
      add: (...args: unknown[]) => ({ _op: 'add', args }),
      timing: jest.fn(
        (_value: MockAnimatedValue, config: Record<string, unknown>) => {
          timingCalls.push({ config });
          return makeController();
        },
      ),
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
  it('renders the medallion and wordmark lockup on the launch field', async () => {
    const { getByText, queryByTestId } = render(<AnimatedLaunchScreen />);
    await flushReduceMotionRead();

    expect(queryByTestId('animated-launch-screen')).toBeTruthy();
    expect(getByText('LEGACY SPORTS')).toBeTruthy();
    expect(getByText('Where history plays on.')).toBeTruthy();
  });

  it('runs draw -> punch -> stamp -> fade as a fixed-length timeline, onFinished once at the total', async () => {
    const onFinished = jest.fn();
    render(<AnimatedLaunchScreen onFinished={onFinished} />);
    await flushReduceMotionRead();

    // Draw: one linear timing over LAUNCH_DRAW_MS, plus the wobble loop.
    expect(
      getMock()._timingCalls.some(
        (c) => c.config['duration'] === LAUNCH_DRAW_MS,
      ),
    ).toBe(true);
    expect(getMock()._loopCalls).toHaveLength(1);
    getMock()._timingCalls.length = 0;

    // Punch phase starts exactly at LAUNCH_DRAW_MS: 3 parallel timings
    // (linear progress, eased pop, kick decay) all over LAUNCH_PUNCH_MS.
    act(() => {
      jest.advanceTimersByTime(LAUNCH_DRAW_MS - 1);
    });
    expect(getMock()._timingCalls).toHaveLength(0);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    // 3 timings share this duration: linear progress + eased pop, both over
    // LAUNCH_PUNCH_MS, plus the camera-kick decay, whose own fixed 450ms
    // duration coincides numerically with LAUNCH_PUNCH_MS (450) here.
    expect(
      getMock()._timingCalls.filter(
        (c) => c.config['duration'] === LAUNCH_PUNCH_MS,
      ),
    ).toHaveLength(3);
    expect(onFinished).not.toHaveBeenCalled();

    // Stamp phase starts at LAUNCH_DRAW_MS + LAUNCH_PUNCH_MS.
    act(() => {
      jest.advanceTimersByTime(LAUNCH_PUNCH_MS);
    });
    expect(
      getMock()._timingCalls.filter(
        (c) => c.config['duration'] === LAUNCH_STAMP_MS,
      ),
    ).toHaveLength(2);

    // Fade starts at draw + punch + stamp, using the same 150ms fade as before.
    act(() => {
      jest.advanceTimersByTime(LAUNCH_STAMP_MS);
    });
    expect(
      getMock()._timingCalls.some(
        (c) => c.config['duration'] === LAUNCH_FADE_OUT_MS,
      ),
    ).toBe(true);
    expect(onFinished).not.toHaveBeenCalled();

    // onFinished fires exactly once, at the total lifetime.
    act(() => {
      jest.advanceTimersByTime(LAUNCH_FADE_OUT_MS);
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

  it('collapses to the final frame (real logo + wordmark) when reduce motion is enabled', async () => {
    getMock()._setReduceMotion(true);
    const onFinished = jest.fn();
    render(<AnimatedLaunchScreen onFinished={onFinished} />);
    await flushReduceMotionRead();

    // No draw/punch/stamp timings or wobble loop — the reveal jumps straight
    // to the final frame.
    expect(
      getMock()._timingCalls.some(
        (c) => c.config['duration'] === LAUNCH_DRAW_MS,
      ),
    ).toBe(false);
    expect(getMock()._loopCalls).toHaveLength(0);

    // The opacity-only fade-out still runs on the same fixed schedule.
    act(() => {
      jest.advanceTimersByTime(
        LAUNCH_DRAW_MS + LAUNCH_PUNCH_MS + LAUNCH_STAMP_MS,
      );
    });
    expect(
      getMock()._timingCalls.filter(
        (c) => c.config['duration'] === LAUNCH_FADE_OUT_MS,
      ),
    ).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(LAUNCH_FADE_OUT_MS);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('holds the timeline until start turns true (LS-9728)', async () => {
    const onFinished = jest.fn();
    const { rerender } = render(
      <AnimatedLaunchScreen start={false} onFinished={onFinished} />,
    );
    await flushReduceMotionRead();

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
    await flushReduceMotionRead();
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

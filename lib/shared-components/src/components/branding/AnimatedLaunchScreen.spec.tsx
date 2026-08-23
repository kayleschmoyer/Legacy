/**
 * AnimatedLaunchScreen (LS-9464) — cold-start branded launch overlay.
 *
 * Under test:
 *  - renders the brand lockup (wordmark + tagline) on the #0A0F1A field
 *  - fixed-length timeline: fade-out starts after reveal + hold, onFinished
 *    fires at LAUNCH_TOTAL_MS (jest fake timers)
 *  - only transform and opacity are animated (brand motion rule)
 *  - reduce-motion collapses the reveal to the final frame (no timing() reveal;
 *    only the opacity-only fade-out runs)
 *  - unmount before completion never fires onFinished (cleanup)
 *
 * The setup-level react-native mock differs per jest project (web vs mobile),
 * so this spec ships its own minimal mock — the same pattern as
 * PickSplashStatGraphic.native.spec.tsx.
 */
import React from 'react';
import { act } from '@testing-library/react';
import {
  AnimatedLaunchScreen,
  LAUNCH_FADE_OUT_MS,
  LAUNCH_HOLD_MS,
  LAUNCH_REVEAL_MS,
  LAUNCH_TOTAL_MS,
} from './AnimatedLaunchScreen';
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

  // Every animated style prop handed to Animated.View is recorded here so
  // tests can assert which style keys carry animated values.
  const animatedViewStyles: unknown[] = [];
  const timingCalls: { value: MockAnimatedValue; config: object }[] = [];

  const AnimatedView = ({
    children,
    style,
    testID,
  }: {
    children?: React.ReactNode;
    style?: unknown;
    testID?: string;
  }) => {
    animatedViewStyles.push(style);
    return <div data-testid={testID}>{children}</div>;
  };

  let reduceMotionEnabled = false;

  return {
    Animated: {
      Value: MockAnimatedValue,
      View: AnimatedView,
      timing: jest.fn((value: MockAnimatedValue, config: object) => {
        timingCalls.push({ value, config });
        return { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
      }),
      parallel: jest.fn((animations: { start: jest.Mock }[]) => ({
        start: jest.fn(() => {
          animations.forEach((a) => {
            a.start();
          });
        }),
        stop: jest.fn(),
        reset: jest.fn(),
      })),
    },
    Easing: {
      out: jest.fn((easing: unknown) => easing),
      quad: jest.fn(),
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: jest.fn(() =>
        Promise.resolve(reduceMotionEnabled),
      ),
    },
    // Non-standard exports so tests can reach the recorded state.
    _animatedViewStyles: animatedViewStyles,
    _timingCalls: timingCalls,
    _setReduceMotion: (enabled: boolean) => {
      reduceMotionEnabled = enabled;
    },
  };
});

interface MockedReactNative {
  Animated: { timing: jest.Mock };
  AccessibilityInfo: { isReduceMotionEnabled: jest.Mock };
  _animatedViewStyles: unknown[];
  _timingCalls: { value: { value: number }; config: Record<string, unknown> }[];
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

/** Collect the style keys that carry animated (MockAnimatedValue) values. */
function collectAnimatedStyleKeys(): Set<string> {
  const keys = new Set<string>();
  const visit = (style: unknown): void => {
    if (Array.isArray(style)) {
      style.forEach(visit);
      return;
    }
    if (!style || typeof style !== 'object') return;
    for (const [key, value] of Object.entries(style)) {
      if (key === 'transform' && Array.isArray(value)) {
        keys.add('transform');
        continue;
      }
      if (value && typeof value === 'object' && 'setValue' in value) {
        keys.add(key);
      }
    }
  };
  getMock()._animatedViewStyles.forEach(visit);
  return keys;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  getMock()._animatedViewStyles.length = 0;
  getMock()._timingCalls.length = 0;
  getMock()._setReduceMotion(false);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AnimatedLaunchScreen', () => {
  it('renders the brand lockup on the launch field', async () => {
    const { getByText, queryByTestId } = render(<AnimatedLaunchScreen />);
    await flushReduceMotionRead();

    expect(queryByTestId('animated-launch-screen')).toBeTruthy();
    expect(getByText('LEGACY SPORTS')).toBeTruthy();
    expect(getByText('Where history plays on.')).toBeTruthy();
  });

  it('starts the reveal after the reduce-motion read resolves false', async () => {
    render(<AnimatedLaunchScreen />);
    await flushReduceMotionRead();

    // Three reveal timings: rule scaleX, lockup opacity, lockup translateY.
    expect(getMock().Animated.timing).toHaveBeenCalledTimes(3);
    for (const { config } of getMock()._timingCalls) {
      expect(config['duration']).toBe(LAUNCH_REVEAL_MS);
      expect(config['useNativeDriver']).toBe(true);
    }
  });

  it('runs the fixed-length timeline: fade-out after reveal + hold, onFinished at total', async () => {
    const onFinished = jest.fn();
    render(<AnimatedLaunchScreen onFinished={onFinished} />);
    await flushReduceMotionRead();
    getMock()._timingCalls.length = 0;

    // Just before the fade-out point: nothing new.
    act(() => {
      jest.advanceTimersByTime(LAUNCH_REVEAL_MS + LAUNCH_HOLD_MS - 1);
    });
    expect(getMock()._timingCalls).toHaveLength(0);
    expect(onFinished).not.toHaveBeenCalled();

    // Fade-out starts exactly at reveal + hold.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(getMock()._timingCalls).toHaveLength(1);
    expect(getMock()._timingCalls[0]?.config['duration']).toBe(
      LAUNCH_FADE_OUT_MS,
    );
    expect(onFinished).not.toHaveBeenCalled();

    // onFinished fires at the total lifetime, exactly once.
    act(() => {
      jest.advanceTimersByTime(LAUNCH_FADE_OUT_MS);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(LAUNCH_TOTAL_MS);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('animates only transform and opacity (brand motion rule)', async () => {
    render(<AnimatedLaunchScreen />);
    await flushReduceMotionRead();
    act(() => {
      jest.advanceTimersByTime(LAUNCH_TOTAL_MS);
    });

    const animatedKeys = collectAnimatedStyleKeys();
    expect(animatedKeys.size).toBeGreaterThan(0);
    for (const key of animatedKeys) {
      expect(['opacity', 'transform']).toContain(key);
    }
  });

  it('collapses to a crossfade when reduce motion is enabled', async () => {
    getMock()._setReduceMotion(true);
    const onFinished = jest.fn();
    render(<AnimatedLaunchScreen onFinished={onFinished} />);
    await flushReduceMotionRead();

    // No reveal timings — the reveal jumps to its final frame.
    expect(getMock().Animated.timing).not.toHaveBeenCalled();

    // The opacity-only fade-out still runs and the overlay still finishes.
    act(() => {
      jest.advanceTimersByTime(LAUNCH_REVEAL_MS + LAUNCH_HOLD_MS);
    });
    expect(getMock()._timingCalls).toHaveLength(1);
    const fadeCall = getMock()._timingCalls[0];
    expect(fadeCall?.config['duration']).toBe(LAUNCH_FADE_OUT_MS);

    act(() => {
      jest.advanceTimersByTime(LAUNCH_FADE_OUT_MS);
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

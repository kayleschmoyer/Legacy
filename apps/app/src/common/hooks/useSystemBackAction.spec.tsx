import React from 'react';
import { BackHandler, Text } from 'react-native';
import { render } from '@testing-library/react-native';

import { useSystemBackAction } from './useSystemBackAction';

// `useFocusEffect` subscribes on focus, tears down on blur/unmount, and re-runs
// when the callback identity changes — which is what `useEffect` does with the
// callback in its dep array. (The `mock` prefix is what lets the hoisted
// `jest.mock` factory reference this binding.)
const mockUseEffect = React.useEffect;

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => (() => void) | void) => {
    mockUseEffect(cb, [cb]);
  },
}));

function Probe({
  enabled,
  onBack,
}: {
  enabled: boolean;
  onBack: () => void;
}): React.JSX.Element {
  useSystemBackAction(enabled, onBack);
  return <Text>probe</Text>;
}

describe('useSystemBackAction (LS-8766)', () => {
  let handlers: Array<() => boolean>;
  let removeSpy: jest.Mock;

  beforeEach(() => {
    handlers = [];
    removeSpy = jest.fn();
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        handlers.push(handler as () => boolean);
        return { remove: removeSpy };
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registers no handler while disabled, so system back pops the route', () => {
    render(<Probe enabled={false} onBack={jest.fn()} />);
    expect(handlers).toHaveLength(0);
  });

  it('runs the action and swallows the back press while enabled', () => {
    const onBack = jest.fn();
    render(<Probe enabled onBack={onBack} />);

    expect(handlers).toHaveLength(1);
    // Returning true tells Android the app handled the press, so the navigator
    // does not additionally pop the screen.
    expect(handlers[0]()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes when the screen no longer has a sub-view to unwind', () => {
    const { rerender } = render(<Probe enabled onBack={jest.fn()} />);
    rerender(<Probe enabled={false} onBack={jest.fn()} />);

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('calls the latest callback without re-subscribing on every render', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = render(<Probe enabled onBack={first} />);
    rerender(<Probe enabled onBack={second} />);

    expect(handlers).toHaveLength(1);
    handlers[0]();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});

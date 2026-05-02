import React from 'react';
import { LiveLamp } from './LiveLamp';
import { render } from '../../test-utils';

describe('LiveLamp', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    // Restore any spies created with jest.spyOn so the next test starts
    // with the original global setInterval / clearInterval.
    jest.restoreAllMocks();
  });

  it('renders without starting the pulse interval when pulse is false', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    render(<LiveLamp />);
    // pulse defaults to false — no interval should be scheduled
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('starts a recurring interval when pulse is true', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    render(<LiveLamp pulse />);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('clears the interval when the lamp unmounts', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = render(<LiveLamp pulse />);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('clears the interval when the pulse prop flips back to false', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const { rerender } = render(<LiveLamp pulse />);
    clearIntervalSpy.mockClear();
    rerender(<LiveLamp pulse={false} />);
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});

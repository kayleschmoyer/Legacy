import React from 'react';
import { act, renderHook } from '@testing-library/react';
import {
  SAVED_BANNER_DURATION_MS,
  SavedBannerProvider,
  useSavedBanner,
  useTriggerSave,
} from './SavedBannerContext';

describe('useSavedBanner', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the banner on triggerSave and hides it after the duration', () => {
    const { result } = renderHook(() => useSavedBanner());
    expect(result.current.saved).toBe(false);
    act(() => result.current.triggerSave());
    expect(result.current.saved).toBe(true);
    act(() => {
      jest.advanceTimersByTime(SAVED_BANNER_DURATION_MS);
    });
    expect(result.current.saved).toBe(false);
  });

  it('flags a failed save and clears the flag on the next successful one', () => {
    const { result } = renderHook(() => useSavedBanner());
    act(() => result.current.triggerSave(false));
    expect(result.current.saved).toBe(true);
    expect(result.current.saveFailed).toBe(true);
    act(() => result.current.triggerSave());
    expect(result.current.saveFailed).toBe(false);
  });

  it('restarts the timer when saves overlap so the banner is not hidden early', () => {
    const { result } = renderHook(() => useSavedBanner());
    act(() => result.current.triggerSave());
    act(() => {
      jest.advanceTimersByTime(SAVED_BANNER_DURATION_MS - 500);
    });
    act(() => result.current.triggerSave());
    act(() => {
      jest.advanceTimersByTime(SAVED_BANNER_DURATION_MS - 500);
    });
    expect(result.current.saved).toBe(true);
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.saved).toBe(false);
  });
});

describe('useTriggerSave', () => {
  it('returns the provider triggerSave', () => {
    const triggerSave = jest.fn();
    const { result } = renderHook(() => useTriggerSave(), {
      wrapper: ({ children }) => (
        <SavedBannerProvider triggerSave={triggerSave}>
          {children}
        </SavedBannerProvider>
      ),
    });
    result.current();
    expect(triggerSave).toHaveBeenCalledTimes(1);
  });

  it('throws outside a provider', () => {
    const spy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    expect(() => renderHook(() => useTriggerSave())).toThrow(
      /SavedBannerProvider/,
    );
    spy.mockRestore();
  });
});

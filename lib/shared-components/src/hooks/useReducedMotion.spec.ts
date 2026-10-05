import { act, renderHook } from '@testing-library/react';
import {
  USER_PREFERENCES_CHANGED_EVENT,
  useReducedMotion,
} from './useReducedMotion';

function mockMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (): MediaQueryList =>
      ({
        matches,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }) as unknown as MediaQueryList,
  });
}

describe('useReducedMotion', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockMatchMedia(false);
  });

  it('is false with no OS setting and no stored preference', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('stays false without throwing when window has no matchMedia (React Native)', () => {
    // React Native defines a global `window` without DOM APIs (LS-9249).
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('is true when the OS requests reduced motion', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('is true when enableAnimations is stored as false', () => {
    window.localStorage.setItem(
      'ls_user_preferences',
      JSON.stringify({ enableAnimations: false }),
    );
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('stays false when enableAnimations is true or the blob is corrupt', () => {
    window.localStorage.setItem(
      'ls_user_preferences',
      JSON.stringify({ enableAnimations: true }),
    );
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
    window.localStorage.setItem('ls_user_preferences', '{not json');
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });

  it('reacts to same-tab preference changes', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => {
      window.localStorage.setItem(
        'ls_user_preferences',
        JSON.stringify({ enableAnimations: false }),
      );
      window.dispatchEvent(new Event(USER_PREFERENCES_CHANGED_EVENT));
    });
    expect(result.current).toBe(true);
  });
});

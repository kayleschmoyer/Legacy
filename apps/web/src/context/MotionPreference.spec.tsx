/**
 * LS-10273: the Preferences "Animations" toggle drives a global
 * `<html data-animations>` switch from app root, with no reload needed.
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import {
  PREFS_STORAGE_KEY,
  USER_PREFERENCES_CHANGED_EVENT,
} from '@legacy-sports/shared-components/utils';

import {
  MotionPreferenceSync,
  resolveEnableAnimations,
} from './MotionPreference';

function mockOsReducedMotion(reduce: boolean) {
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: reduce,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

function savePrefs(prefs: Record<string, unknown>) {
  localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
}

describe('resolveEnableAnimations', () => {
  beforeEach(() => {
    localStorage.clear();
    mockOsReducedMotion(false);
  });

  it('uses the saved preference over the OS default', () => {
    mockOsReducedMotion(true);
    savePrefs({ enableAnimations: true });
    expect(resolveEnableAnimations()).toBe(true);

    mockOsReducedMotion(false);
    savePrefs({ enableAnimations: false });
    expect(resolveEnableAnimations()).toBe(false);
  });

  it('falls back to the OS default when nothing usable is saved', () => {
    expect(resolveEnableAnimations()).toBe(true);
    mockOsReducedMotion(true);
    expect(resolveEnableAnimations()).toBe(false);
    savePrefs({ defaultSport: 'baseball' });
    expect(resolveEnableAnimations()).toBe(false);
    localStorage.setItem(PREFS_STORAGE_KEY, '{ not valid json');
    expect(resolveEnableAnimations()).toBe(false);
  });
});

describe('MotionPreferenceSync', () => {
  beforeEach(() => {
    localStorage.clear();
    mockOsReducedMotion(false);
    delete document.documentElement.dataset.animations;
  });

  it('sets data-animations at load from the saved preference', () => {
    savePrefs({ enableAnimations: false });
    render(<MotionPreferenceSync />);
    expect(document.documentElement.dataset.animations).toBe('off');
  });

  it('sets data-animations from the OS default when nothing is saved', () => {
    mockOsReducedMotion(true);
    render(<MotionPreferenceSync />);
    expect(document.documentElement.dataset.animations).toBe('off');
  });

  it('follows a same-tab toggle without a reload', () => {
    render(<MotionPreferenceSync />);
    expect(document.documentElement.dataset.animations).toBe('on');

    savePrefs({ enableAnimations: false });
    act(() => {
      window.dispatchEvent(new Event(USER_PREFERENCES_CHANGED_EVENT));
    });
    expect(document.documentElement.dataset.animations).toBe('off');

    savePrefs({ enableAnimations: true });
    act(() => {
      window.dispatchEvent(new Event(USER_PREFERENCES_CHANGED_EVENT));
    });
    expect(document.documentElement.dataset.animations).toBe('on');
  });

  it('follows a write from another tab', () => {
    render(<MotionPreferenceSync />);
    savePrefs({ enableAnimations: false });
    act(() => {
      window.dispatchEvent(new Event('storage'));
    });
    expect(document.documentElement.dataset.animations).toBe('off');
  });

  it('stops listening after unmount', () => {
    const { unmount } = render(<MotionPreferenceSync />);
    unmount();
    savePrefs({ enableAnimations: false });
    act(() => {
      window.dispatchEvent(new Event(USER_PREFERENCES_CHANGED_EVENT));
    });
    expect(document.documentElement.dataset.animations).toBe('on');
  });
});

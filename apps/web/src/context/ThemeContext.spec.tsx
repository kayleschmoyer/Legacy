/**
 * LS-7076 regression: with preference "system", a live OS light/dark flip
 * (matchMedia `change` event) must update `resolvedTheme` and the `<html>`
 * theme class without a page reload, and the listener must be removed on
 * unmount.
 */
import React from 'react';
import { act, render } from '@testing-library/react';

import { ThemeProvider, useThemeContext } from './ThemeContext';

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserByIdQuery: () => ({ data: undefined }),
  useUpdateUserThemeMutation: () => [jest.fn()],
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ user: undefined }),
}));

type ChangeHandler = (e: { matches: boolean }) => void;

function installMatchMedia(initialDark: boolean) {
  const handlers = new Set<ChangeHandler>();
  const addEventListener = jest.fn((_: string, h: ChangeHandler) =>
    handlers.add(h),
  );
  const removeEventListener = jest.fn((_: string, h: ChangeHandler) =>
    handlers.delete(h),
  );
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: initialDark,
    addEventListener,
    removeEventListener,
  }));
  return {
    addEventListener,
    removeEventListener,
    emit: (matches: boolean) =>
      act(() => {
        handlers.forEach((h) => h({ matches }));
      }),
  };
}

function Probe() {
  const { resolvedTheme } = useThemeContext();
  return <span data-testid="resolved">{resolvedTheme}</span>;
}

function renderProvider() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

describe('ThemeProvider system theme (LS-7076)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('t_light', 't_dark');
  });

  it('follows live OS theme changes when preference is "system"', () => {
    const mq = installMatchMedia(false);
    const { getByTestId } = renderProvider();

    expect(mq.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
    expect(getByTestId('resolved').textContent).toBe('light');
    expect(document.documentElement.classList.contains('t_light')).toBe(true);

    mq.emit(true);
    expect(getByTestId('resolved').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('t_dark')).toBe(true);
    expect(document.documentElement.classList.contains('t_light')).toBe(false);

    mq.emit(false);
    expect(getByTestId('resolved').textContent).toBe('light');
  });

  it('ignores OS changes when the user has pinned a theme', () => {
    localStorage.setItem('ls_theme_preference', 'light');
    const mq = installMatchMedia(false);
    const { getByTestId } = renderProvider();

    mq.emit(true);
    expect(getByTestId('resolved').textContent).toBe('light');
  });

  describe('single source of truth (LS-7078)', () => {
    function ThemeSetter() {
      const { themePreference, setThemePreference } = useThemeContext();
      return (
        <button onClick={() => setThemePreference('dark')}>
          {themePreference}
        </button>
      );
    }

    it('persists to its own key and never writes theme into the prefs blob', () => {
      installMatchMedia(false);
      localStorage.setItem(
        'ls_user_preferences',
        JSON.stringify({ statsFormat: 'expanded' }),
      );
      const { getByRole } = render(
        <ThemeProvider>
          <ThemeSetter />
        </ThemeProvider>,
      );

      act(() => getByRole('button').click());

      expect(localStorage.getItem('ls_theme_preference')).toBe('dark');
      expect(
        JSON.parse(localStorage.getItem('ls_user_preferences') ?? '{}'),
      ).toEqual({ statsFormat: 'expanded' });
    });

    it('migrates a legacy blob theme to its own key and scrubs the blob', () => {
      installMatchMedia(false);
      localStorage.setItem(
        'ls_user_preferences',
        JSON.stringify({ theme: 'dark', statsFormat: 'expanded' }),
      );
      const { getByTestId } = renderProvider();

      expect(getByTestId('resolved').textContent).toBe('dark');
      expect(localStorage.getItem('ls_theme_preference')).toBe('dark');
      expect(
        JSON.parse(localStorage.getItem('ls_user_preferences') ?? '{}'),
      ).toEqual({ statsFormat: 'expanded' });
    });

    it('prefers its own key over a stale legacy blob theme', () => {
      installMatchMedia(false);
      localStorage.setItem('ls_theme_preference', 'light');
      localStorage.setItem(
        'ls_user_preferences',
        JSON.stringify({ theme: 'dark' }),
      );
      const { getByTestId } = renderProvider();

      expect(getByTestId('resolved').textContent).toBe('light');
    });
  });

  it('removes the matchMedia listener on unmount', () => {
    const mq = installMatchMedia(false);
    const { unmount } = renderProvider();
    unmount();
    expect(mq.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });
});

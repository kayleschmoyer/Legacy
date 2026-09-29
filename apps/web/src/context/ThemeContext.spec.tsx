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
    localStorage.setItem(
      'ls_user_preferences',
      JSON.stringify({ theme: 'light' }),
    );
    const mq = installMatchMedia(false);
    const { getByTestId } = renderProvider();

    mq.emit(true);
    expect(getByTestId('resolved').textContent).toBe('light');
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

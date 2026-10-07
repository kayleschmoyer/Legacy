/**
 * Regression guard for LS-10706: the header profile menu only closed on a
 * click outside — Escape left it open with aria-expanded="true", and arrow
 * keys never moved focus into the items.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { UserProfileDropdown } from './UserProfileDropdown';

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { username: 'tester', email: 'tester@example.com', picture: null },
    logout: jest.fn(),
  }),
}));

jest.mock('../../context/ThemeContext', () => ({
  useThemeContext: () => ({
    themePreference: 'system',
    setThemePreference: jest.fn(),
  }),
}));

const renderDropdown = () =>
  render(
    <MemoryRouter>
      <UserProfileDropdown />
    </MemoryRouter>,
  );

const openMenu = () => {
  const trigger = screen.getByTestId('user-profile-trigger');
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
};

describe('UserProfileDropdown keyboard — LS-10706', () => {
  it('advertises a menu popup on the trigger', () => {
    renderDropdown();
    const trigger = screen.getByTestId('user-profile-trigger');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape and returns focus to the trigger', () => {
    renderDropdown();
    const trigger = openMenu();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('user-profile-dropdown')).toBeTruthy();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });

    expect(screen.queryByTestId('user-profile-dropdown')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape pressed from inside the menu', () => {
    renderDropdown();
    const trigger = openMenu();
    screen.getByTestId('user-profile-menu-preferences').focus();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });

    expect(screen.queryByTestId('user-profile-dropdown')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('moves focus through the menu items with ArrowDown/ArrowUp', () => {
    renderDropdown();
    openMenu();
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toBe(screen.getByTestId('user-profile-menu-settings'));

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'ArrowDown',
    });
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'ArrowDown',
    });
    expect(document.activeElement).toBe(items[1]);

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'ArrowUp',
    });
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'ArrowUp',
    });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });
});

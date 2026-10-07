/**
 * Regression guard for LS-10706: the Help menu closed on Escape but arrow
 * keys never moved focus into its items, and Escape left focus behind.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { HelpMenuButton } from './HelpMenuButton';

const renderMenu = () =>
  render(
    <MemoryRouter>
      <HelpMenuButton />
    </MemoryRouter>,
  );

const openMenu = () => {
  const trigger = screen.getByRole('button', { name: 'Help & support' });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
};

describe('HelpMenuButton keyboard — LS-10706', () => {
  it('moves focus through the menu items with ArrowDown/ArrowUp', () => {
    renderMenu();
    openMenu();
    const items = screen.getAllByRole('menuitem');

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
    expect(document.activeElement).toBe(items[0]);
  });

  it('closes on Escape and returns focus to the trigger', () => {
    renderMenu();
    const trigger = openMenu();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'ArrowDown',
    });

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
});

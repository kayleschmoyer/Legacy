import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EliteDraftBoardScreen } from './EliteDraftBoard';

// Minimal smoke + a11y semantics tests for the draft board

describe('EliteDraftBoardScreen a11y', () => {
  test('has main landmark and complementary asides', () => {
    render(<EliteDraftBoardScreen />);

    const main = screen.getByRole('main', { name: /player draft board/i });
    expect(main).toBeInTheDocument();

    const asides = screen.getAllByRole('complementary');
    // left: my team & controls, right: AI & analytics
    expect(asides.length).toBeGreaterThanOrEqual(2);
  });

  test('exposes timer role and shows pick status', () => {
    render(<EliteDraftBoardScreen />);
    const timer = screen.getByRole('timer', {
      name: /pick timer|waiting timer/i,
    });
    expect(timer).toBeInTheDocument();
  });

  test('position filter is a radiogroup and updates aria-checked via keyboard', async () => {
    const user = userEvent.setup();
    render(<EliteDraftBoardScreen />);

    const group = screen.getByRole('radiogroup', {
      name: /filter by position/i,
    });
    expect(group).toBeInTheDocument();

    const allBtn = screen.getByRole('radio', { name: 'ALL' });
    const cBtn = screen.getByRole('radio', { name: 'C' });

    // Initial state: ALL selected
    expect(allBtn).toHaveAttribute('aria-checked', 'true');

    // Move to next with ArrowRight
    await user.click(allBtn);
    await user.keyboard('{ArrowRight}');
    expect(cBtn).toHaveAttribute('aria-checked', 'true');

    // Home should go to first (ALL)
    await user.keyboard('{Home}');
    expect(allBtn).toHaveAttribute('aria-checked', 'true');

    // End should go to last (P)
    await user.keyboard('{End}');
    const pBtn = screen.getByRole('radio', { name: 'P' });
    expect(pBtn).toHaveAttribute('aria-checked', 'true');
  });

  test('view mode is a radiogroup and toggles aria-checked', async () => {
    const user = userEvent.setup();
    render(<EliteDraftBoardScreen />);

    const group = screen.getByRole('radiogroup', { name: /view mode/i });
    expect(group).toBeInTheDocument();

    const grid = screen.getByRole('radio', { name: '⊞' });
    const list = screen.getByRole('radio', { name: '☰' });

    expect(grid).toHaveAttribute('aria-checked', 'true');
    await user.click(list);
    expect(list).toHaveAttribute('aria-checked', 'true');
  });

  test('watchlist toggle exposes aria-pressed', async () => {
    const user = userEvent.setup();
    render(<EliteDraftBoardScreen />);

    // Find first player card and its watch button (☆)
    const watchButtons = screen.getAllByRole('button', {
      name: /add .* to watchlist|remove .* from watchlist/i,
    });
    expect(watchButtons.length).toBeGreaterThan(0);

    const btn = watchButtons[0];
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });
});

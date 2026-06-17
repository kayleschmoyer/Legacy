import React from 'react';
import { DraftChatOverlay } from './DraftChatOverlay';
import type { LeagueTeam } from './types';
import { render, screen } from '../../test-utils';

const leagueTeams: LeagueTeam[] = [{ id: '1', name: 'Team One' } as LeagueTeam];

function renderOverlay(onClose = jest.fn()) {
  return render(
    <DraftChatOverlay
      leagueId={5670}
      userId={42}
      leagueTeams={leagueTeams}
      onClose={onClose}
      renderChat={() => <div>chat</div>}
    />,
  );
}

describe('DraftChatOverlay', () => {
  it('calls onClose when the close button is clicked', () => {
    const onClose = jest.fn();
    renderOverlay(onClose);
    screen.getByRole('button', { name: 'Close league chat' }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Regression for LS-8070: the close button reuses the `.d-btn-glass` class,
  // which is a full-width sidebar button (display: block; width: 100%). Without
  // inline overrides the close "X" stretched across the chat header and looked
  // massive. The button must neutralize the full-width layout so it renders as
  // a compact icon button.
  it('renders the close button as a compact icon button, not full width', () => {
    renderOverlay();
    const closeButton = screen.getByRole('button', {
      name: 'Close league chat',
    });
    expect(closeButton.style.width).toBe('auto');
    expect(closeButton.style.display).toBe('inline-flex');
    expect(closeButton.style.marginBottom).toBe('0px');
  });
});

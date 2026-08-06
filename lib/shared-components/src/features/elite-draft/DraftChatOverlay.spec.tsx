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

  // Regression for LS-8070: the close button used to reuse the shared
  // `.d-btn-glass` class (display: block; width: 100%), which stretched the
  // close "X" across the chat header. The Tamagui port builds the control
  // from scratch with no shared full-width class to inherit from, so it
  // renders alongside the title as a sibling in a space-between header row
  // instead of stretching to fill it.
  it('renders the close button as a sibling of the title, not a full-width block', () => {
    renderOverlay();
    const closeButton = screen.getByRole('button', {
      name: 'Close league chat',
    });
    expect(closeButton.parentElement).toContainElement(
      screen.getByText('League Chat'),
    );
  });
});

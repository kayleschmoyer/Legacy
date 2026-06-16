/**
 * Regression gate for LS-7980:
 * Non-commissioner users must see the autopick toggle.
 * Commissioner controls must only appear for actual commissioners.
 */
import React from 'react';
import { DraftTopBand } from './DraftTopBand';
import { render } from '../../test-utils';

const baseProps = {
  draftPaused: false,
  currentPick: 5,
  round: 1,
  timeRemaining: 60,
  pickTimeLimitSeconds: 90,
  isMyPick: false,
  currentPickInfo: null,
  leagueTeamsLength: 10,
  draftId: 42,
  commPickMode: false,
  autoPickDisabled: false,
  pauseLoading: false,
  resumeLoading: false,
  autoPickDisabledLoading: false,
  isMyTeamAutoPick: false,
  toggleAutoPickLoading: false,
  myTeamId: 7,
  teamNameById: () => 'Test Team',
  onPauseDraft: jest.fn(),
  onResumeDraft: jest.fn(),
  onToggleCommPickMode: jest.fn(),
  onToggleAutoPickDisabled: jest.fn(),
  onToggleUserAutoPick: jest.fn(),
};

describe('DraftTopBand round meta (LS-7973)', () => {
  it('renders the team count in the round meta', () => {
    const { getByText } = render(
      <DraftTopBand
        {...baseProps}
        isCommissioner={false}
        isOwner={false}
        round={2}
        currentPickInfo={{
          draftId: 42,
          pickNumber: 3,
          teamId: 1,
          overallPick: 13,
          round: 2,
          isComplete: false,
        }}
      />,
    );
    expect(getByText(/Round 2 · Pick 3 of 10/)).toBeTruthy();
  });

  it('renders a fallback dash when leagueTeamsLength is 0', () => {
    const { getByText } = render(
      <DraftTopBand
        {...baseProps}
        isCommissioner={false}
        isOwner={false}
        leagueTeamsLength={0}
        round={1}
        currentPickInfo={null}
      />,
    );
    expect(getByText(/Round 1 · Pick — of —/)).toBeTruthy();
  });
});

describe('DraftTopBand autopick visibility (LS-7980)', () => {
  it('shows the autopick toggle for a non-commissioner team member', () => {
    const { getByRole } = render(
      <DraftTopBand {...baseProps} isCommissioner={false} isOwner={false} />,
    );
    expect(getByRole('switch', { name: /auto.?pick/i })).toBeTruthy();
  });

  it('hides commissioner controls for a non-commissioner team member', () => {
    const { queryByRole } = render(
      <DraftTopBand {...baseProps} isCommissioner={false} isOwner={false} />,
    );
    expect(queryByRole('button', { name: /pause/i })).toBeNull();
    expect(queryByRole('button', { name: /resume/i })).toBeNull();
  });

  it('shows commissioner controls for a commissioner', () => {
    const { getByRole } = render(
      <DraftTopBand {...baseProps} isCommissioner={true} isOwner={true} />,
    );
    expect(getByRole('button', { name: /pause/i })).toBeTruthy();
  });

  it('hides the autopick toggle when the user has no team (myTeamId null)', () => {
    const { queryByRole } = render(
      <DraftTopBand
        {...baseProps}
        isCommissioner={true}
        isOwner={true}
        myTeamId={null}
      />,
    );
    expect(queryByRole('switch', { name: /auto.?pick/i })).toBeNull();
  });

  it('shows the autopick toggle for a non-commissioner even when isOwner is true', () => {
    const { getByRole, queryByRole } = render(
      <DraftTopBand {...baseProps} isCommissioner={false} isOwner={true} />,
    );
    expect(getByRole('switch', { name: /auto.?pick/i })).toBeTruthy();
    expect(queryByRole('button', { name: /pause/i })).toBeNull();
  });
});

describe('DraftTopBand commissioner button labels (LS-8063)', () => {
  it('renders the Commish and per-team auto-pick buttons without a trailing ellipsis', () => {
    const { getByRole } = render(
      <DraftTopBand {...baseProps} isCommissioner={true} isOwner={true} />,
    );

    // The commissioner-pick-mode toggle and the per-team auto-pick toggle
    // previously shipped a hardcoded "…" suffix ("Commish…" / "AP…") that
    // looked like a truncation ellipsis even though the labels fit. The
    // labels must render in full with no ellipsis character.
    const commishBtn = getByRole('button', { name: /commish/i });
    const apBtn = getByRole('button', {
      name: /toggle per-team auto-pick controls/i,
    });

    expect(commishBtn.textContent).toBe('Commish');
    expect(apBtn.textContent).toBe('AP');
    expect(commishBtn.textContent).not.toContain('…');
    expect(apBtn.textContent).not.toContain('…');
  });
});

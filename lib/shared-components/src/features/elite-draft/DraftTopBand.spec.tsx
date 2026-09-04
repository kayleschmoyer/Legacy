/**
 * Regression gate for LS-7980:
 * Non-commissioner users must see the autopick toggle.
 * Commissioner controls must only appear for actual commissioners.
 */
import React from 'react';
import { DraftTopBand } from './DraftTopBand';
import { fireEvent, render } from '../../test-utils';

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

describe('DraftTopBand slow-mode clock (LS-8064)', () => {
  it('shows an hours group in the header for a slow-mode draft, matching the sidebar', () => {
    const { getByText } = render(
      <DraftTopBand
        {...baseProps}
        isCommissioner={false}
        isOwner={false}
        // 4-hour pick clock with 2h 02m 05s remaining
        timeRemaining={7325}
        pickTimeLimitSeconds={14400}
      />,
    );
    expect(getByText('2:02:05')).toBeTruthy();
    expect(getByText(/of 4:00:00/)).toBeTruthy();
  });

  it('keeps M:SS formatting for a fast draft', () => {
    const { getByText } = render(
      <DraftTopBand
        {...baseProps}
        isCommissioner={false}
        isOwner={false}
        timeRemaining={75}
        pickTimeLimitSeconds={120}
      />,
    );
    expect(getByText('1:15')).toBeTruthy();
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

  it('hides commissioner controls in a mock draft even though the user is registered as commissioner (LS-9242)', () => {
    const { queryByRole } = render(
      <DraftTopBand
        {...baseProps}
        isCommissioner={true}
        isOwner={true}
        isMockDraft={true}
      />,
    );
    expect(queryByRole('button', { name: /pause/i })).toBeNull();
    expect(queryByRole('button', { name: /commish/i })).toBeNull();
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

// LS-8783: the league-wide "Disable Auto-Pick" toggle moved from the sidebar
// into the top band's commissioner controls when the sidebar was retired.
describe('DraftTopBand global Disable Auto-Pick control (LS-8783)', () => {
  it('is hidden for non-commissioners', () => {
    const { queryByRole } = render(
      <DraftTopBand {...baseProps} isCommissioner={false} isOwner={false} />,
    );
    expect(queryByRole('button', { name: /disable ap/i })).toBeNull();
  });

  it('calls onToggleAutoPickDisabled when a commissioner clicks it', () => {
    const onToggleAutoPickDisabled = jest.fn();
    const { getByRole } = render(
      <DraftTopBand
        {...baseProps}
        isCommissioner={true}
        isOwner={true}
        onToggleAutoPickDisabled={onToggleAutoPickDisabled}
      />,
    );
    fireEvent.click(getByRole('button', { name: /disable ap/i }));
    expect(onToggleAutoPickDisabled).toHaveBeenCalledTimes(1);
  });

  it('shows the disabled state and label once auto-pick is off', () => {
    const { getByRole } = render(
      <DraftTopBand
        {...baseProps}
        isCommissioner={true}
        isOwner={true}
        autoPickDisabled={true}
      />,
    );
    expect(getByRole('button', { name: /auto-pick off/i })).toBeTruthy();
  });
});

describe('DraftTopBand Exit Draft control (LS-9238)', () => {
  it('is hidden when isMockDraft is false', () => {
    const { queryByRole } = render(
      <DraftTopBand
        {...baseProps}
        isCommissioner={false}
        isOwner={false}
        isMockDraft={false}
        onExitDraft={jest.fn()}
      />,
    );
    expect(queryByRole('button', { name: /exit draft/i })).toBeNull();
  });

  it('is hidden when no onExitDraft handler is supplied, even if isMockDraft is true', () => {
    const { queryByRole } = render(
      <DraftTopBand
        {...baseProps}
        isCommissioner={false}
        isOwner={false}
        isMockDraft={true}
      />,
    );
    expect(queryByRole('button', { name: /exit draft/i })).toBeNull();
  });

  it('renders and calls onExitDraft when clicked for a mock draft', () => {
    const onExitDraft = jest.fn();
    const { getByRole } = render(
      <DraftTopBand
        {...baseProps}
        isCommissioner={false}
        isOwner={false}
        isMockDraft={true}
        onExitDraft={onExitDraft}
      />,
    );
    fireEvent.click(getByRole('button', { name: /exit draft/i }));
    expect(onExitDraft).toHaveBeenCalledTimes(1);
  });
});

describe('DraftTopBand untimed (offline) mode (LS-9144, LS-9243)', () => {
  it('renders no pick timer at all', () => {
    const { queryByRole, queryByText } = render(
      <DraftTopBand
        {...baseProps}
        isCommissioner={true}
        isOwner={true}
        untimed
      />,
    );
    expect(queryByRole('timer', { name: /pick timer/i })).toBeNull();
    expect(queryByText('∞')).toBeNull();
    expect(queryByText('No limit')).toBeNull();
    expect(queryByText('Take your time')).toBeNull();
  });

  it('still shows commissioner Pause controls in untimed mode', () => {
    const { getByRole } = render(
      <DraftTopBand
        {...baseProps}
        isCommissioner={true}
        isOwner={true}
        untimed
      />,
    );
    expect(getByRole('button', { name: /pause/i })).toBeTruthy();
  });
});

describe('DraftTopBand connection staleness (LS-9856)', () => {
  it('marks the pick timer stale while disconnected', () => {
    const { getByLabelText, getByText } = render(
      <DraftTopBand
        {...baseProps}
        isCommissioner={false}
        isOwner={false}
        connectionStale
      />,
    );

    expect(getByLabelText('Pick timer (stale)')).toBeTruthy();
    expect(getByText('Stale')).toBeTruthy();
  });

  it('shows the normal timer caption when connected', () => {
    const { getByLabelText, getByText } = render(
      <DraftTopBand {...baseProps} isCommissioner={false} isOwner={false} />,
    );

    expect(getByLabelText('Pick timer')).toBeTruthy();
    expect(getByText('Time left')).toBeTruthy();
  });
});

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

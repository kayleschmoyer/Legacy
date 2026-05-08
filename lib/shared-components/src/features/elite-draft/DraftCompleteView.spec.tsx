/**
 * Regression gate for LS-4268 / LS-3823 / LS-4214:
 * DraftCompleteView must render the "Draft Complete!" banner.
 *
 * After 9 incidents of the live-draft Phase 5 assertion failing because
 * "Draft Complete!" was not visible, this spec pins the component's output
 * so any removal of the banner text fails fast in CI rather than surfacing
 * as a flaky E2E timeout.
 */
import React from 'react';
import { DraftCompleteView } from './DraftCompleteView';
import { render } from '../../test-utils';

const defaultProps = {
  league: { isMockDraft: false, name: 'Test League' },
  leagueId: 1,
  pickHistory: [],
  myTeamId: 1,
  myTeam: [],
  myTeamPicks: [],
  leagueTeams: [],
  statsLookup: new Map(),
  onNavigate: jest.fn(),
};

describe('DraftCompleteView', () => {
  it('renders the "Draft Complete!" banner (primary regression gate)', () => {
    const { getByText } = render(<DraftCompleteView {...defaultProps} />);
    expect(getByText('Draft Complete!')).toBeTruthy();
  });

  it('shows real-draft completion message when isMockDraft is false', () => {
    const { getByText } = render(<DraftCompleteView {...defaultProps} />);
    expect(
      getByText(/all 0 picks have been made\. your roster is set!/i),
    ).toBeTruthy();
  });

  it('shows mock-draft completion message when isMockDraft is true', () => {
    const { getByText } = render(
      <DraftCompleteView
        {...defaultProps}
        league={{ isMockDraft: true, name: 'Test League' }}
      />,
    );
    expect(
      getByText(/no rosters were saved — this was a practice draft/i),
    ).toBeTruthy();
  });

  it('shows "Set My Lineup" and "Back to League" CTAs for real drafts', () => {
    const { getByText } = render(<DraftCompleteView {...defaultProps} />);
    expect(getByText('Set My Lineup')).toBeTruthy();
    expect(getByText('Back to League')).toBeTruthy();
  });

  it('shows "Practice Again" and "Go to My Leagues" CTAs for mock drafts', () => {
    const { getByText } = render(
      <DraftCompleteView
        {...defaultProps}
        league={{ isMockDraft: true, name: 'Test League' }}
      />,
    );
    expect(getByText('Practice Again')).toBeTruthy();
    expect(getByText('Go to My Leagues')).toBeTruthy();
  });

  it('navigates to roster when "Set My Lineup" is clicked', () => {
    const onNavigate = jest.fn();
    const { getByText } = render(
      <DraftCompleteView {...defaultProps} onNavigate={onNavigate} />,
    );
    getByText('Set My Lineup').click();
    expect(onNavigate).toHaveBeenCalledWith('/baseball/league/1/roster');
  });
});

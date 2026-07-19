import React from 'react';
import { fireEvent, screen } from '@testing-library/react';

import {
  useGetLeagueTeamsQuery,
  useGetMatchupsByWeekQuery,
} from '@legacy-sports/graphql';
import type { MatchupFragment } from '@legacy-sports/graphql';
import { MatchupNavigationControls } from './MatchupNavigationControls';
import { render } from '../../test-utils';

jest.mock('@legacy-sports/graphql');

// Only the fields MatchupNavigationControls actually reads (id, weekNumber,
// team1Id, team2Id) matter for this test.
const createMatchup = (
  overrides: Partial<MatchupFragment> = {},
): MatchupFragment =>
  ({
    id: '1',
    weekNumber: 2,
    team1Id: 1,
    team2Id: 2,
    ...overrides,
  }) as unknown as MatchupFragment;

// Week 3 has no matchups (deleted/cancelled), matching the reported bug.
const WEEK2_MATCHUP = createMatchup({ id: '2', weekNumber: 2 });
const WEEK4_MATCHUP = createMatchup({ id: '4', weekNumber: 4 });
const ALL_MATCHUPS = [WEEK2_MATCHUP, WEEK4_MATCHUP];

function setupMocks() {
  jest.mocked(useGetLeagueTeamsQuery).mockReturnValue({
    data: {
      leagueTeams: [
        { id: 1, name: 'Alpha Squad' },
        { id: 2, name: 'Beta Force' },
      ],
    },
    loading: false,
    error: undefined,
  } as unknown as ReturnType<typeof useGetLeagueTeamsQuery>);

  jest
    .mocked(useGetMatchupsByWeekQuery)
    .mockImplementation((options?: { variables?: { weekNumber?: number } }) => {
      const weekNumber = options?.variables?.weekNumber;
      const matchups = ALL_MATCHUPS.filter((m) => m.weekNumber === weekNumber);
      return {
        data: { getMatchupsByWeek: matchups },
        loading: false,
      } as unknown as ReturnType<typeof useGetMatchupsByWeekQuery>;
    });
}

describe('MatchupNavigationControls — week stepping (LS-5887)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('steps to the literal next week and shows its empty state, instead of silently jumping over a week with no matchups', () => {
    const onMatchupChange = jest.fn();
    render(
      <MatchupNavigationControls
        currentMatchup={WEEK2_MATCHUP}
        leagueId={10}
        allMatchups={ALL_MATCHUPS}
        onMatchupChange={onMatchupChange}
      />,
    );

    expect(screen.getByText('Week 2')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Next week'));

    // Lands on the literal next week (3), not week 4, and shows its empty
    // state rather than silently skipping straight to the next week that
    // happens to have matchups.
    expect(screen.getByText('Week 3')).toBeTruthy();
    expect(screen.getByText('No matchups for Week 3')).toBeTruthy();
    expect(onMatchupChange).not.toHaveBeenCalled();
  });

  it('steps back to the literal previous week from week 4', () => {
    const onMatchupChange = jest.fn();
    render(
      <MatchupNavigationControls
        currentMatchup={WEEK4_MATCHUP}
        leagueId={10}
        allMatchups={ALL_MATCHUPS}
        onMatchupChange={onMatchupChange}
      />,
    );

    expect(screen.getByText('Week 4')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Previous week'));

    expect(screen.getByText('Week 3')).toBeTruthy();
    expect(screen.getByText('No matchups for Week 3')).toBeTruthy();
    expect(onMatchupChange).not.toHaveBeenCalled();
  });
});

describe('MatchupNavigationControls — blocks stepping while allMatchups is empty (LS-5889)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('disables Prev/Next and does not advance the week when allMatchups has not loaded yet', () => {
    const onMatchupChange = jest.fn();
    render(
      <MatchupNavigationControls
        currentMatchup={WEEK2_MATCHUP}
        leagueId={10}
        allMatchups={[]}
        onMatchupChange={onMatchupChange}
      />,
    );

    expect(screen.getByText('Week 2')).toBeTruthy();

    const nextButton = screen.getByLabelText('Next week');
    const prevButton = screen.getByLabelText('Previous week');
    expect(nextButton.getAttribute('tabIndex')).toBe('-1');
    expect(prevButton.getAttribute('tabIndex')).toBe('-1');

    fireEvent.click(nextButton);
    fireEvent.click(prevButton);

    // Week is unchanged and no stale matchupId was ever selected.
    expect(screen.getByText('Week 2')).toBeTruthy();
    expect(onMatchupChange).not.toHaveBeenCalled();
  });
});

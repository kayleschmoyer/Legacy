import React from 'react';
import { PlayoffBracket, type PlayoffBracketData } from './PlayoffBracket';
import { render } from '../../test-utils';

const completedBracket: PlayoffBracketData = {
  season: 2024,
  format: '4-team',
  status: 'completed',
  championTeam: { name: 'Alpha Squad' },
  matchups: [
    {
      id: '1',
      round: 'wildcard',
      matchupNumber: 1,
      weekNumber: 9,
      isMultiWeek: false,
      status: 'completed',
      highSeedTeamId: 1,
      lowSeedTeamId: 4,
      winnerTeamId: 1,
      highSeedScore: 85.5,
      lowSeedScore: 62.3,
      highSeedTeam: { name: 'Alpha Squad' },
      lowSeedTeam: { name: 'Delta Kings' },
    },
    {
      id: '2',
      round: 'finals',
      matchupNumber: 1,
      weekNumber: 11,
      isMultiWeek: false,
      status: 'completed',
      highSeedTeamId: 1,
      lowSeedTeamId: 3,
      winnerTeamId: 1,
      highSeedScore: 91.2,
      lowSeedScore: 74.6,
      highSeedTeam: { name: 'Alpha Squad' },
      lowSeedTeam: { name: 'Gamma Stars' },
    },
  ],
};

describe('PlayoffBracket', () => {
  it('renders the bracket header and round labels', () => {
    const { getByText, getAllByText } = render(
      <PlayoffBracket bracket={completedBracket} />,
    );

    expect(getByText('Playoff Bracket')).toBeTruthy();
    expect(getByText('Wild Card')).toBeTruthy();
    expect(getByText('Championship')).toBeTruthy();
    // Champion callout + the finals card both render the champion name.
    expect(getAllByText('Alpha Squad').length).toBeGreaterThan(0);
  });

  it('renders scores and final badges for completed matchups', () => {
    const { getByText, getAllByText } = render(
      <PlayoffBracket bracket={completedBracket} />,
    );

    expect(getByText('85.5')).toBeTruthy();
    expect(getByText('62.3')).toBeTruthy();
    expect(getAllByText('Final').length).toBeGreaterThan(0);
  });

  it('shows TBD placeholders when seeds are not yet assigned', () => {
    const scheduled: PlayoffBracketData = {
      season: 2024,
      format: '4-team',
      status: 'scheduled',
      championTeam: null,
      matchups: [
        {
          id: '5',
          round: 'wildcard',
          matchupNumber: 1,
          weekNumber: 12,
          isMultiWeek: false,
          status: 'scheduled',
          highSeedTeamId: null,
          lowSeedTeamId: null,
          winnerTeamId: null,
          highSeedScore: null,
          lowSeedScore: null,
          highSeedTeam: null,
          lowSeedTeam: null,
        },
      ],
    };

    const { getAllByText } = render(<PlayoffBracket bracket={scheduled} />);

    expect(getAllByText('TBD').length).toBeGreaterThan(0);
  });
});

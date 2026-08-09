import React from 'react';
import { render } from '@testing-library/react';
import { LeagueListRow } from './HomeScreen';
import type { HomeLeagueSummary } from './leagueSummaryStats';

/**
 * LS-8791: LeagueListRow threw "TypeError: undefined is not a function"
 * during its own render on Android. Root cause was `formatDraftDate`
 * (imported from `@legacy-sports/utils`) resolving to `undefined` at
 * runtime — Metro resolves that package to `lib/utils/src/mobile.ts` via
 * the package.json "react-native" field, and that barrel did not
 * re-export `formatDraftDate` (it was only defined in the web/node
 * `index.ts` barrel), so tsc (which resolves via "main"/"types") stayed
 * green while the native bundle threw at the call site (LS-8755/LS-8768).
 *
 * This suite renders LeagueListRow directly — not just indirectly through
 * HomeScreen — under the mobile jest project (jest.config.mobile.ts),
 * which is the project that resolves the same `__PLATFORM_COMPONENTS__`
 * shim the device does, so a regression here is caught before it reaches
 * a build.
 */
describe('LeagueListRow (LS-8791)', () => {
  const onPress = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  it('renders the pre-draft state without throwing, formatting the scheduled draft date', () => {
    const summary: HomeLeagueSummary = {
      leagueId: 1,
      leagueName: 'Deadball Diamonds',
      leaguePhase: 'pre-draft',
      draftScheduledAt: '2026-04-20T20:00:00.000Z',
      teamCount: 10,
    };

    const { getByText } = render(
      <LeagueListRow summary={summary} onPress={onPress} />,
    );

    expect(getByText('Deadball Diamonds')).toBeTruthy();
    expect(getByText('Draft scheduled')).toBeTruthy();
    // formatDraftDate('2026-04-20T20:00:00.000Z') -> something like "Apr 20, ...".
    // asserting the whole row rendered (rather than throwing to the error
    // boundary) is the point of this test; the exact clock format is
    // locale-dependent so only the month/day are asserted.
    expect(getByText(/Apr 20/)).toBeTruthy();
  });

  it('renders the live-draft state without throwing', () => {
    const summary: HomeLeagueSummary = {
      leagueId: 2,
      leagueName: 'Iron Horse Dynasty',
      draftStatus: 'in-progress',
      draftMode: 'Snake',
    };

    const { getByText } = render(
      <LeagueListRow summary={summary} onPress={onPress} />,
    );

    expect(getByText('Live')).toBeTruthy();
    expect(getByText('Snake')).toBeTruthy();
  });

  it('renders the live-matchup state without throwing', () => {
    const summary: HomeLeagueSummary = {
      leagueId: 3,
      leagueName: 'Rival FC',
      matchupId: 7,
      matchupStatus: 'in_progress',
      userScore: 12.5,
      opponentScore: 9.25,
      opponentTeamName: 'Rival FC',
    };

    const { getByText } = render(
      <LeagueListRow summary={summary} onPress={onPress} />,
    );

    expect(getByText('12.5')).toBeTruthy();
    expect(getByText(/vs 9.3/)).toBeTruthy();
  });

  it('renders the default record state without throwing', () => {
    const summary: HomeLeagueSummary = {
      leagueId: 4,
      leagueName: 'Sunbelt Sluggers',
      wins: 6,
      losses: 2,
      rank: 1,
      totalTeams: 10,
    };

    const { getByText } = render(
      <LeagueListRow summary={summary} onPress={onPress} />,
    );

    expect(getByText('6-2')).toBeTruthy();
    expect(getByText('Rank #1 of 10')).toBeTruthy();
  });

  it('renders the Mock Draft affordance for pre-draft leagues when onMockDraft is supplied', () => {
    const onMockDraft = jest.fn();
    const summary: HomeLeagueSummary = {
      leagueId: 5,
      leagueName: 'Legends League',
      leaguePhase: 'pre-draft',
      draftScheduledAt: '2026-05-01T18:00:00.000Z',
    };

    const { getByText } = render(
      <LeagueListRow
        summary={summary}
        onPress={onPress}
        onMockDraft={onMockDraft}
      />,
    );

    expect(getByText('Mock Draft')).toBeTruthy();
  });
});

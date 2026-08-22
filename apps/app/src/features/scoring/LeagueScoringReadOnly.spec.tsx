import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';
import { LeagueScoringReadOnly } from './LeagueScoringReadOnly';

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

jest.mock('@legacy-sports/graphql', () => ({
  DefensiveFormat: { Dst: 'dst', Idp: 'idp' },
  Sport: { Baseball: 'baseball', Football: 'football' },
}));

jest.mock('tamagui', () => {
  const { View, Text } = jest.requireActual<RNComponents>('react-native');
  return {
    createTokens: (tokens: unknown) => tokens,
    Card: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
    Spinner: () => <View testID="spinner" />,
    Text: ({ children }: { children?: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    XStack: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
    YStack: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

// `@legacy-sports/scoring` is pure TS (no RN deps) — use the real
// implementation rather than re-mocking its stat-grouping logic.

function makeProfile(
  stats: Array<{
    id: number;
    statGroup: string;
    displayName: string;
    multiplier: number;
    defaultMultiplier: number;
  }>,
) {
  return {
    stats: stats.map((s) => ({
      multiplier: s.multiplier,
      defaultMultiplier: s.defaultMultiplier,
      definition: {
        id: s.id,
        statGroup: s.statGroup,
        displayName: s.displayName,
        description: null,
        defaultMultiplier: s.defaultMultiplier,
        enforcePositive: false,
        enforceNegative: false,
        minMultiplier: null,
        maxMultiplier: null,
      },
    })),
  } as never;
}

describe('LeagueScoringReadOnly', () => {
  it('shows a loading state', () => {
    render(<LeagueScoringReadOnly profile={undefined} loading error={null} />);
    expect(screen.getByText('Loading scoring profile…')).toBeTruthy();
  });

  it('shows an error state', () => {
    render(
      <LeagueScoringReadOnly
        profile={undefined}
        loading={false}
        error={new Error('boom')}
      />,
    );
    expect(
      screen.getByText('Failed to load scoring profile: boom'),
    ).toBeTruthy();
  });

  it('shows an empty state when the profile has no stats', () => {
    render(<LeagueScoringReadOnly profile={makeProfile([])} loading={false} />);
    expect(
      screen.getByText('No scoring stats are available yet for this league.'),
    ).toBeTruthy();
  });

  it('renders football groups with the DST group when defensiveFormat is DST', () => {
    render(
      <LeagueScoringReadOnly
        profile={makeProfile([
          {
            id: 1,
            statGroup: 'passing',
            displayName: 'Passing Yards',
            multiplier: 0.04,
            defaultMultiplier: 0.04,
          },
          {
            id: 2,
            statGroup: 'defense',
            displayName: 'Sacks',
            multiplier: 1,
            defaultMultiplier: 1,
          },
          {
            id: 3,
            statGroup: 'idp',
            displayName: 'Tackles',
            multiplier: 1,
            defaultMultiplier: 1,
          },
        ])}
        loading={false}
        sport={'football' as never}
        defensiveFormat="dst"
      />,
    );
    expect(screen.getByText('Passing Yards')).toBeTruthy();
    expect(screen.getByText('Defense / Special Teams (D/ST)')).toBeTruthy();
    expect(screen.queryByText('Sacks')).toBeTruthy();
    expect(screen.queryByText('Individual Defensive Players (IDP)')).toBeNull();
    expect(screen.queryByText('Tackles')).toBeNull();
  });

  it('renders the IDP group instead of D/ST when defensiveFormat is IDP', () => {
    render(
      <LeagueScoringReadOnly
        profile={makeProfile([
          {
            id: 2,
            statGroup: 'defense',
            displayName: 'Sacks',
            multiplier: 1,
            defaultMultiplier: 1,
          },
          {
            id: 3,
            statGroup: 'idp',
            displayName: 'Tackles',
            multiplier: 1,
            defaultMultiplier: 1,
          },
        ])}
        loading={false}
        sport={'football' as never}
        defensiveFormat="idp"
      />,
    );
    expect(screen.getByText('Individual Defensive Players (IDP)')).toBeTruthy();
    expect(screen.getByText('Tackles')).toBeTruthy();
    expect(screen.queryByText('Defense / Special Teams (D/ST)')).toBeNull();
    expect(screen.queryByText('Sacks')).toBeNull();
  });

  it('marks an overridden stat multiplier distinctly from its display value', () => {
    render(
      <LeagueScoringReadOnly
        profile={makeProfile([
          {
            id: 1,
            statGroup: 'batting',
            displayName: 'Home Runs',
            multiplier: 5,
            defaultMultiplier: 4,
          },
        ])}
        loading={false}
      />,
    );
    expect(screen.getByText('+5x')).toBeTruthy();
  });
});

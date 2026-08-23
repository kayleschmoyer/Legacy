import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import type {
  AppTeamMemberFragment,
  LeaguePositionFragment,
} from '@legacy-sports/graphql';
import { LineupEditor } from './LineupEditor';

type RNComponents = { View: typeof RNView; Text: typeof RNText };

// ── Mocks ────────────────────────────────────────────────────────────────────

// humanize-string is ESM-only and outside the app's jest transformIgnorePatterns
// allowlist; only starter slots (not exercised in these bench-badge tests) use it.
jest.mock('humanize-string', () => ({
  __esModule: true,
  default: (value: string) => value,
}));

// requireActual isn't used here since the real barrel pulls in native OAuth
// deps Jest can't parse; ALLOWED_POSITIONS/PITCHING_POSITIONS mirror the real
// baseball-only constants from lib/utils/src/lib/allowed-positions.ts.
jest.mock('@legacy-sports/shared-components', () => ({
  ALLOWED_POSITIONS: {
    C: ['C'],
    '1B': ['1B'],
    SP: ['SP', 'P'],
    RP: ['RP', 'P'],
  },
  PITCHING_POSITIONS: new Set(['SP', 'RP', 'P']),
}));

jest.mock('tamagui', () => {
  const {
    View,
    Text: RNTextComp,
    Pressable,
  } = jest.requireActual<
    RNComponents & { Pressable: typeof import('react-native').Pressable }
  >('react-native');
  return {
    createTokens: (tokens: unknown) => tokens,
    ScrollView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    YStack: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    Separator: () => <View testID="separator" />,
    Button: ({
      children,
      onPress,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
    }) => (
      <Pressable onPress={onPress}>
        {<RNTextComp>{children}</RNTextComp>}
      </Pressable>
    ),
    Text: ({ children }: { children: React.ReactNode }) => (
      <RNTextComp>{children}</RNTextComp>
    ),
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function benchTeamMember(
  playerId: number,
  eligiblePositions: string[],
): AppTeamMemberFragment {
  return {
    id: playerId,
    playerId,
    positionId: null,
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    player: {
      id: playerId,
      firstName: 'Bench',
      lastName: `Player${playerId}`,
      brefId: null,
      eligiblePositions,
    },
  };
}

const NOOP = (): void => {
  /* not exercised in these tests */
};

function renderLineup(
  team: readonly AppTeamMemberFragment[],
  sport: 'baseball' | 'football',
) {
  return render(
    <LineupEditor
      availableRosterSlots={[] as readonly LeaguePositionFragment[]}
      onPlayerAdded={NOOP}
      onPlayerMoved={NOOP}
      onPlayerRemoved={NOOP}
      team={team}
      projections={{}}
      actual={{}}
      sport={sport}
    />,
  );
}

// ── Tests (LS-6436) ──────────────────────────────────────────────────────────

describe('LineupEditor bench badge — sport gating (LS-6436)', () => {
  it("shows 'BP' for a pitching-only bench player in a baseball lineup", () => {
    renderLineup([benchTeamMember(1, ['SP'])], 'baseball');
    expect(screen.getByText('BP')).toBeTruthy();
    expect(screen.queryByText('BE')).toBeNull();
  });

  it("shows 'BE' for a bench player with normal football eligibility", () => {
    renderLineup([benchTeamMember(2, ['QB'])], 'football');
    expect(screen.getByText('BE')).toBeTruthy();
    expect(screen.queryByText('BP')).toBeNull();
  });

  it("never shows 'BP' in a football lineup, even if eligiblePositions collides with a baseball pitching code", () => {
    // Simulates the future-collision risk called out in the finding: a
    // football position abbreviation matching the baseball PITCHING_POSITIONS
    // set ('P') must not resurrect the baseball-only badge.
    renderLineup([benchTeamMember(3, ['P'])], 'football');
    expect(screen.getByText('BE')).toBeTruthy();
    expect(screen.queryByText('BP')).toBeNull();
  });

  it("shows 'BE' for a baseball batter (non-pitcher) bench player", () => {
    renderLineup([benchTeamMember(4, ['1B'])], 'baseball');
    expect(screen.getByText('BE')).toBeTruthy();
    expect(screen.queryByText('BP')).toBeNull();
  });
});

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import type {
  AppTeamMemberFragment,
  LeaguePositionFragment,
} from '@legacy-sports/graphql';
import { LineupEditor, type LineupEditorProps } from './LineupEditor';

type RNComponents = { View: typeof RNView; Text: typeof RNText };

// ── Mocks ────────────────────────────────────────────────────────────────────

// humanize-string is ESM-only and outside the app's jest transformIgnorePatterns
// allowlist; only starter slots (not exercised in these bench-badge tests) use it.
jest.mock('humanize-string', () => ({
  __esModule: true,
  default: (value: string) => value,
}));

// requireActual isn't used here since the real barrel pulls in native OAuth
// deps Jest can't parse; PITCHING_POSITIONS mirrors the real baseball-only
// constant from lib/utils/src/lib/allowed-positions.ts.
jest.mock('@legacy-sports/shared-components', () => ({
  PITCHING_POSITIONS: new Set(['SP', 'RP', 'P']),
}));

// @legacy-sports/shared-components/roster re-exports RosterBoard and friends,
// which pull in the same native/OAuth deps Jest can't parse — mock just the
// sport-aware canPlayerPlayPosition, mirroring the real
// ALLOWED_POSITIONS_BY_SPORT semantics (lib/utils/src/lib/allowed-positions.ts)
// over a small controlled position set (LS-9688).
const ALLOWED_POSITIONS_BY_SPORT: Record<
  'baseball' | 'football',
  Record<string, string[]>
> = {
  baseball: {
    C: ['C'],
    '1B': ['1B'],
    SP: ['SP', 'P'],
    RP: ['RP', 'P'],
  },
  football: {
    QB: ['QB'],
    RB: ['RB'],
  },
};

jest.mock('@legacy-sports/shared-components/roster', () => ({
  canPlayerPlayPosition: (
    player: { player?: { eligiblePositions?: string[] | null } | null },
    positionType: string | null | undefined,
    sport: 'baseball' | 'football',
  ) => {
    const eligible = player.player?.eligiblePositions ?? [];
    if (eligible.length === 0) return true;
    const allowed = ALLOWED_POSITIONS_BY_SPORT[sport][positionType ?? ''];
    if (!allowed) return false;
    return eligible.some((pos) => allowed.includes(pos));
  },
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
      disabled,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
    }) => (
      <Pressable onPress={onPress} disabled={disabled}>
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

function starterSlot(id: number, positionType: string): LeaguePositionFragment {
  return { id, leagueId: 1, positionType };
}

const NOOP = (): void => {
  /* not exercised in these tests */
};

function renderLineup(
  team: readonly AppTeamMemberFragment[],
  sport: 'baseball' | 'football',
  availableRosterSlots: readonly LeaguePositionFragment[] = [],
  onPlayerAdded: LineupEditorProps['onPlayerAdded'] = NOOP,
) {
  return render(
    <LineupEditor
      availableRosterSlots={availableRosterSlots}
      onPlayerAdded={onPlayerAdded}
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

// ── Tests (LS-9688) ─────────────────────────────────────────────────────────
//
// canPlayerPlayPosition previously read the bare (baseball-only)
// ALLOWED_POSITIONS map, so every football starter-slot button was always
// disabled regardless of the selected player's eligibility. These tests
// exercise the starter-slot Button's `disabled` gating directly, selecting a
// bench player and asserting whether the resulting starter-slot button is
// enabled — the same code path a manager hits when trying to start a player.

describe('LineupEditor starter-slot eligibility — sport gating (LS-9688)', () => {
  it('enables the starter slot for a football bench player eligible for that slot', () => {
    renderLineup([benchTeamMember(10, ['QB'])], 'football', [
      starterSlot(100, 'QB'),
    ]);

    fireEvent.press(screen.getByText('BE')); // select the bench player
    expect(screen.getByText('QB')).not.toBeDisabled();
  });

  it('disables the starter slot for a football bench player NOT eligible for that slot', () => {
    renderLineup([benchTeamMember(11, ['RB'])], 'football', [
      starterSlot(101, 'QB'),
    ]);

    fireEvent.press(screen.getByText('BE')); // select the bench player
    expect(screen.getByText('QB')).toBeDisabled();
  });

  it('enables the starter slot for a baseball bench player eligible for that slot', () => {
    renderLineup([benchTeamMember(12, ['1B'])], 'baseball', [
      starterSlot(102, '1B'),
    ]);

    fireEvent.press(screen.getByText('BE')); // select the bench player
    expect(screen.getByText('1B')).not.toBeDisabled();
  });

  it('disables the starter slot for a baseball bench player NOT eligible for that slot', () => {
    renderLineup([benchTeamMember(13, ['1B'])], 'baseball', [
      starterSlot(103, 'C'),
    ]);

    fireEvent.press(screen.getByText('BE')); // select the bench player
    expect(screen.getByText('C')).toBeDisabled();
  });
});

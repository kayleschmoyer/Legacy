import { AppTeamMemberFragment } from '@legacy-sports/graphql';
import { isBatter, isPitcher } from './Models';

// Models.ts only needs ALLOWED_POSITIONS/PITCHING_POSITIONS from
// @legacy-sports/shared-components; mock the barrel with the canonical,
// jest-safe @legacy-sports/utils source (hoisted above the imports above by
// babel-plugin-jest-hoist) to avoid pulling in the native
// (react-native-google-signin) dependency chain the full barrel drags in.
jest.mock('@legacy-sports/shared-components', () =>
  jest.requireActual<
    typeof import('../../../../../lib/utils/src/lib/allowed-positions')
  >('../../../../../lib/utils/src/lib/allowed-positions'),
);

function makeTeamMember(
  eligiblePositions: string[] | null | undefined,
): AppTeamMemberFragment {
  return {
    id: 1,
    playerId: 1,
    positionId: null,
    teamId: 1,
    leagueId: 1,
    onTradeBlock: false,
    player: {
      id: 1,
      firstName: 'Test',
      lastName: 'Player',
      brefId: null,
      eligiblePositions,
    },
  };
}

describe('isPitcher / isBatter', () => {
  it('returns false for both on a null teamMember', () => {
    expect(isPitcher(null)).toBe(false);
    expect(isBatter(null)).toBe(false);
  });

  it('is batter-only (never pitcher) when eligiblePositions is empty', () => {
    const teamMember = makeTeamMember([]);
    expect(isPitcher(teamMember)).toBe(false);
    expect(isBatter(teamMember)).toBe(true);
  });

  it('is batter-only (never pitcher) when eligiblePositions is null', () => {
    const teamMember = makeTeamMember(null);
    expect(isPitcher(teamMember)).toBe(false);
    expect(isBatter(teamMember)).toBe(true);
  });

  it('is pitcher-only for a player eligible only at pitching positions', () => {
    const teamMember = makeTeamMember(['SP', 'RP']);
    expect(isPitcher(teamMember)).toBe(true);
    expect(isBatter(teamMember)).toBe(false);
  });

  it('is batter-only for a player eligible only at position-player slots', () => {
    const teamMember = makeTeamMember(['1B', 'OF']);
    expect(isPitcher(teamMember)).toBe(false);
    expect(isBatter(teamMember)).toBe(true);
  });

  it('is both for a two-way player eligible at pitching and batting positions', () => {
    const teamMember = makeTeamMember(['SP', 'OF']);
    expect(isPitcher(teamMember)).toBe(true);
    expect(isBatter(teamMember)).toBe(true);
  });
});

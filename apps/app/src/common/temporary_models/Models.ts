import {
  ALLOWED_POSITIONS,
  PITCHING_POSITIONS,
} from '@legacy-sports/shared-components';
import {
  LeaguePositionFragment,
  TeamMemberFragment,
} from '../../api/db/graphql.generated';

export { ALLOWED_POSITIONS, PITCHING_POSITIONS };

export type Position =
  | 'SP'
  | 'RP'
  | 'C'
  | '1B'
  | '2B'
  | '3B'
  | 'SS'
  | 'RF'
  | 'LF'
  | 'CF'
  | 'DH';

// String-based position slots until GraphQL schema is updated
export enum PositionSlot {
  '1B' = '1B',
  '2B' = '2B',
  '3B' = '3B',
  C = 'C',
  Cf = 'CF',
  Dh = 'DH',
  If = 'IF',
  Lf = 'LF',
  Of = 'OF',
  Rf = 'RF',
  Rp = 'RP',
  Sp = 'SP',
  Ss = 'SS',
  Xdh = 'XDH',
}

// ALLOWED_POSITIONS and PITCHING_POSITIONS are imported from @legacy-sports/shared-components above.

export type PositionType = keyof typeof ALLOWED_POSITIONS;

export function isPitchingSlot(
  value: LeaguePositionFragment | null,
): value is LeaguePositionFragment {
  return (
    value !== null &&
    value.positionType != null &&
    PITCHING_POSITIONS.has(value.positionType)
  );
}

export function isBattingSlot(
  value: LeaguePositionFragment | null,
): value is LeaguePositionFragment {
  return (
    value !== null &&
    value.positionType != null &&
    !PITCHING_POSITIONS.has(value.positionType)
  );
}

export function isPitcher(
  teamMember: TeamMemberFragment | null,
): teamMember is TeamMemberFragment {
  if (teamMember === null) return false;
  const eligible = teamMember.player?.eligiblePositions ?? [];
  // If no eligibility data, fall back to treating everyone as a pitcher
  if (eligible.length === 0) return true;
  return eligible.some((pos) => PITCHING_POSITIONS.has(pos));
}

export function isBatter(
  teamMember: TeamMemberFragment | null,
): teamMember is TeamMemberFragment {
  if (teamMember === null) return false;
  const eligible = teamMember.player?.eligiblePositions ?? [];
  // If no eligibility data, fall back to treating everyone as a batter
  if (eligible.length === 0) return true;
  return eligible.some((pos) => !PITCHING_POSITIONS.has(pos));
}

export function canPlayerPlayPosition(
  player: TeamMemberFragment | undefined,
  positionMapping: LeaguePositionFragment | undefined,
): boolean {
  if (
    player === undefined ||
    positionMapping === undefined ||
    !positionMapping.positionType
  ) {
    return true;
  }

  // Cast to PositionSlot since the schema doesn't provide proper enum types yet
  const positionType = positionMapping.positionType as PositionSlot;
  const allowedPositions = ALLOWED_POSITIONS[positionType];

  if (!allowedPositions) {
    return false;
  }

  const eligible = player.player?.eligiblePositions ?? [];
  // If no eligibility data yet, allow placement
  if (eligible.length === 0) return true;
  return eligible.some((pos) => allowedPositions.includes(pos as Position));
}

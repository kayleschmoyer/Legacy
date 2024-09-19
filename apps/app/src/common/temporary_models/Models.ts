import {
  LeaguePositionFragment,
  PositionSlot,
  TeamMemberWithPositionsFragment,
} from '../../api/db/graphql.generated';

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

export const ALLOWED_POSITIONS = Object.freeze<
  Record<PositionSlot, Position[]>
>({
  [PositionSlot['1B']]: ['1B'],
  [PositionSlot['2B']]: ['2B'],
  [PositionSlot['3B']]: ['3B'],
  [PositionSlot.C]: ['C'],
  [PositionSlot.Cf]: ['CF'],
  [PositionSlot.Dh]: ['1B', '2B', '3B', 'SS', 'LF', 'RF', 'CF', 'C', 'DH'],
  [PositionSlot.If]: ['1B', '2B', '3B', 'SS'],
  [PositionSlot.Lf]: ['LF'],
  [PositionSlot.Of]: ['LF', 'RF', 'CF'],
  [PositionSlot.Rf]: ['RF'],
  [PositionSlot.Rp]: ['RP'],
  [PositionSlot.Sp]: ['SP'],
  [PositionSlot.Ss]: ['SS'],
  [PositionSlot.Xdh]: ['DH'],
});

export const PITCHING_POSITIONS = Object.freeze(new Set(['SP', 'RP']));

export type PositionType = keyof typeof ALLOWED_POSITIONS;

export function isPitchingSlot(
  value: LeaguePositionFragment | null
): value is LeaguePositionFragment {
  return value !== null && PITCHING_POSITIONS.has(value.positionType);
}

export function isBattingSlot(
  value: LeaguePositionFragment | null
): value is LeaguePositionFragment {
  return value !== null && !PITCHING_POSITIONS.has(value.positionType);
}

export function isPitcher(
  teamMember: TeamMemberWithPositionsFragment | null
): teamMember is TeamMemberWithPositionsFragment {
  return (
    teamMember !== null &&
    teamMember.player?.playerEligiblePositions !== undefined &&
    teamMember.player.playerEligiblePositions.nodes.some(
      (p) => p?.position && PITCHING_POSITIONS.has(p.position)
    )
  );
}

export function isBatter(
  teamMember: TeamMemberWithPositionsFragment | null
): teamMember is TeamMemberWithPositionsFragment {
  return (
    teamMember !== null &&
    teamMember.player?.playerEligiblePositions !== undefined &&
    teamMember.player.playerEligiblePositions.nodes.some(
      (p) => p?.position && !PITCHING_POSITIONS.has(p.position)
    )
  );
}

export function canPlayerPlayPosition(
  player: TeamMemberWithPositionsFragment | undefined,
  positionMapping: LeaguePositionFragment | undefined
): boolean {
  if (player === undefined || positionMapping === undefined) {
    return true;
  }

  const allowedPositions = ALLOWED_POSITIONS[positionMapping.positionType];

  for (const pos of allowedPositions) {
    if (
      player.player?.playerEligiblePositions?.nodes.some(
        (e) => e !== null && e.position === pos
      )
    ) {
      return true;
    }
  }

  return false;
}

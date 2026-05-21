import {
  ALLOWED_POSITIONS,
  ALLOWED_POSITIONS_BY_SPORT,
  BATTING_POSITIONS,
  DEFENSIVE_POSITIONS,
  OFFENSIVE_POSITIONS,
  PITCHING_POSITIONS,
  type SportKind,
} from '@legacy-sports/utils/positions';

export {
  ALLOWED_POSITIONS,
  ALLOWED_POSITIONS_BY_SPORT,
  BATTING_POSITIONS,
  DEFENSIVE_POSITIONS,
  OFFENSIVE_POSITIONS,
  PITCHING_POSITIONS,
};
// `SportKind` is defined in `@legacy-sports/utils/positions` (the data-layer
// source of truth, since it keys `ALLOWED_POSITIONS_BY_SPORT`). Within
// shared-components it is surfaced through `config/sports`, which the package
// barrel re-exports; we intentionally do not re-export it from here too, since
// having two re-exports through `lib/shared-components/src/index.ts` would
// cause a TS2308 ambiguity.

// -- Sport-scoped position types -----------------------------------------
// The flat `Position` union is split per sport (ADR 0011). Callers narrow on
// `league.sport` to know which member they hold; baseball-only helpers stay
// baseball-only, football-only helpers stay football-only.

export type BaseballPosition =
  | 'SP' // Starting Pitcher
  | 'RP' // Relief Pitcher
  | 'C' // Catcher
  | '1B' // First Base
  | '2B' // Second Base
  | '3B' // Third Base
  | 'SS' // Shortstop
  | 'RF' // Right Field
  | 'LF' // Left Field
  | 'CF' // Center Field
  | 'DH' // Designated Hitter
  | 'P' // Pitcher (generic)
  | 'IF' // Infield (generic)
  | 'OF'; // Outfield (generic)

export type FootballPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF' | 'FLEX';

/**
 * Sport-discriminated position value. Members are distinguished by the
 * caller's `league.sport`, not by an intrinsic field — callers should narrow
 * via the sport before invoking position-specific helpers (`isPitcher`,
 * `isOffense`, …).
 */
export type Position = BaseballPosition | FootballPosition;

// -- PositionSlot enums --------------------------------------------------

export enum BaseballPositionSlot {
  '1B' = '1B',
  '2B' = '2B',
  '3B' = '3B',
  'C' = 'C',
  'CF' = 'CF',
  'DH' = 'DH',
  'IF' = 'IF',
  'LF' = 'LF',
  'OF' = 'OF',
  'RF' = 'RF',
  'RP' = 'RP',
  'SP' = 'SP',
  'SS' = 'SS',
  'XDH' = 'XDH',
}

export enum FootballPositionSlot {
  'QB' = 'QB',
  'RB' = 'RB',
  'WR' = 'WR',
  'TE' = 'TE',
  'K' = 'K',
  'DEF' = 'DEF',
  'FLEX' = 'FLEX',
  'BENCH' = 'BENCH',
}

/**
 * Baseball-only PositionSlot, retained as a back-compat alias. New code should
 * pick `BaseballPositionSlot` or `FootballPositionSlot` based on
 * `league.sport`.
 */
export { BaseballPositionSlot as PositionSlot };

// -- Interfaces ----------------------------------------------------------

export interface LeaguePosition {
  id: number;
  positionType: string;
  name?: string;
  order?: number;
}

export interface Player {
  id: number;
  firstName: string;
  lastName: string;
  eligiblePositions?: Position[];
}

export interface TeamMember {
  id: number;
  playerId: number;
  positionId?: number | null;
  player?: Player;
  isActive?: boolean;
  /** Optional custom nickname for this player on this roster. (LS-1813) */
  nickname?: string | null;
}

export interface TeamMemberWithPositions extends TeamMember {
  player?: Player & {
    playerEligiblePositions?: {
      nodes: Array<{
        position: Position;
      } | null>;
    };
  };
}

export type BaseballPositionType =
  | '1B'
  | '2B'
  | '3B'
  | 'C'
  | 'CF'
  | 'DH'
  | 'IF'
  | 'LF'
  | 'OF'
  | 'RF'
  | 'RP'
  | 'SP'
  | 'SS'
  | 'XDH';

export type FootballPositionType =
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'K'
  | 'DEF'
  | 'FLEX'
  | 'BENCH';

/**
 * Slot key for any supported sport. Callers that know the sport ahead of time
 * should prefer `BaseballPositionType` or `FootballPositionType`.
 */
export type PositionType = BaseballPositionType | FootballPositionType;

// -- Baseball-only helpers -----------------------------------------------

export function isPitchingSlot(
  value: LeaguePosition | null,
): value is LeaguePosition {
  return value !== null && PITCHING_POSITIONS.has(value.positionType);
}

export function isBattingSlot(
  value: LeaguePosition | null,
): value is LeaguePosition {
  return value !== null && !PITCHING_POSITIONS.has(value.positionType);
}

export function isPitcher(
  teamMember: TeamMemberWithPositions | null,
): teamMember is TeamMemberWithPositions {
  return (
    teamMember !== null &&
    teamMember.player?.playerEligiblePositions !== undefined &&
    teamMember.player.playerEligiblePositions.nodes.some(
      (p) => p?.position && PITCHING_POSITIONS.has(p.position),
    )
  );
}

export function isBatter(
  teamMember: TeamMemberWithPositions | null,
): teamMember is TeamMemberWithPositions {
  return (
    teamMember !== null &&
    teamMember.player?.playerEligiblePositions !== undefined &&
    teamMember.player.playerEligiblePositions.nodes.some(
      (p) => p?.position && !PITCHING_POSITIONS.has(p.position),
    )
  );
}

// -- Football-only helpers -----------------------------------------------

export function isOffense(
  position: string | null | undefined,
): position is FootballPosition {
  return position != null && OFFENSIVE_POSITIONS.has(position);
}

export function isDefense(
  position: string | null | undefined,
): position is FootballPosition {
  return position != null && DEFENSIVE_POSITIONS.has(position);
}

// -- Sport-aware lookup --------------------------------------------------

export function canPlayerPlayPosition(
  player: TeamMemberWithPositions | undefined,
  positionMapping: LeaguePosition | undefined,
  sport: SportKind = 'baseball',
): boolean {
  if (player === undefined || positionMapping === undefined) {
    return true;
  }

  const allowedPositions =
    ALLOWED_POSITIONS_BY_SPORT[sport][positionMapping.positionType];

  if (!allowedPositions) {
    return false;
  }

  if (!player.player?.playerEligiblePositions?.nodes) {
    return false;
  }

  for (const pos of allowedPositions) {
    if (
      player.player.playerEligiblePositions.nodes.some(
        (e) => e !== null && e.position === pos,
      )
    ) {
      return true;
    }
  }

  return false;
}

// Helper function to get position display name
export function getPositionDisplayName(positionType: string): string {
  const displayNames: Record<string, string> = {
    SP: 'SP',
    RP: 'RP',
    C: 'C',
    '1B': '1B',
    '2B': '2B',
    '3B': '3B',
    SS: 'SS',
    LF: 'LF',
    CF: 'CF',
    RF: 'RF',
    OF: 'OF',
    IF: 'IF',
    DH: 'DH',
    XDH: 'DH',
    QB: 'QB',
    RB: 'RB',
    WR: 'WR',
    TE: 'TE',
    K: 'K',
    DEF: 'DEF',
    FLEX: 'FLEX',
    BENCH: 'BENCH',
  };

  return displayNames[positionType] || positionType.toUpperCase();
}

// Helper to check if two positions are compatible
export function arePositionsCompatible(
  playerPosition: Position,
  slotPosition: string,
  sport: SportKind = 'baseball',
): boolean {
  const allowedPositions = ALLOWED_POSITIONS_BY_SPORT[sport][slotPosition];
  return allowedPositions ? allowedPositions.includes(playerPosition) : false;
}

import {
  ALLOWED_POSITIONS,
  PITCHING_POSITIONS,
} from '@legacy-sports/utils/positions';

export { ALLOWED_POSITIONS, PITCHING_POSITIONS };

// Generic position types for shared components
export type Position =
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

// Position slot enum for roster management
export enum PositionSlot {
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

// Position mapping and pitching-position set are imported from
// @legacy-sports/utils and re-exported above — single source of truth.

// Generic interfaces to replace GraphQL-specific ones
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

export type PositionType = keyof typeof ALLOWED_POSITIONS;

export function isPitchingSlot(
  value: LeaguePosition | null,
): value is LeaguePosition {
  return (
    value !== null && PITCHING_POSITIONS.has(value.positionType as Position)
  );
}

export function isBattingSlot(
  value: LeaguePosition | null,
): value is LeaguePosition {
  return (
    value !== null && !PITCHING_POSITIONS.has(value.positionType as Position)
  );
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

export function canPlayerPlayPosition(
  player: TeamMemberWithPositions | undefined,
  positionMapping: LeaguePosition | undefined,
): boolean {
  if (player === undefined || positionMapping === undefined) {
    return true;
  }

  const allowedPositions = ALLOWED_POSITIONS[positionMapping.positionType];

  if (!allowedPositions) {
    return false;
  }

  // Check if player has eligible positions
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
  };

  return displayNames[positionType] || positionType.toUpperCase();
}

// Helper to check if two positions are compatible
export function arePositionsCompatible(
  playerPosition: Position,
  slotPosition: string,
): boolean {
  const allowedPositions = ALLOWED_POSITIONS[slotPosition];
  return allowedPositions ? allowedPositions.includes(playerPosition) : false;
}

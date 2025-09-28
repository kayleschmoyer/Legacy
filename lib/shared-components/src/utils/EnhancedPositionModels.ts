// Enhanced position models that work without GraphQL dependencies

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

export enum PositionSlot {
  'C' = 'C',
  '1B' = '1B',
  '2B' = '2B',
  '3B' = '3B',
  'SS' = 'SS',
  'LF' = 'LF',
  'CF' = 'CF',
  'RF' = 'RF',
  'DH' = 'DH',
  'SP' = 'SP',
  'RP' = 'RP',
  'IF' = 'IF', // Infield
  'OF' = 'OF', // Outfield
  'XDH' = 'XDH', // Extra DH
}

export const ALLOWED_POSITIONS = Object.freeze<
  Record<PositionSlot, Position[]>
>({
  [PositionSlot['1B']]: ['1B'],
  [PositionSlot['2B']]: ['2B'],
  [PositionSlot['3B']]: ['3B'],
  [PositionSlot.C]: ['C'],
  [PositionSlot.CF]: ['CF'],
  [PositionSlot.DH]: ['1B', '2B', '3B', 'SS', 'LF', 'RF', 'CF', 'C', 'DH'],
  [PositionSlot.IF]: ['1B', '2B', '3B', 'SS'],
  [PositionSlot.LF]: ['LF'],
  [PositionSlot.OF]: ['LF', 'RF', 'CF'],
  [PositionSlot.RF]: ['RF'],
  [PositionSlot.RP]: ['RP'],
  [PositionSlot.SP]: ['SP'],
  [PositionSlot.SS]: ['SS'],
  [PositionSlot.XDH]: ['DH'],
});

export const PITCHING_POSITIONS = Object.freeze(
  new Set<Position>(['SP', 'RP']),
);
export const BATTING_POSITIONS = Object.freeze(
  new Set<Position>(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']),
);

export interface PlayerPosition {
  position: Position;
  isPrimary?: boolean;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  eligiblePositions: PlayerPosition[];
}

export interface PositionMapping {
  positionType: PositionSlot;
  displayName?: string;
  isRequired?: boolean;
  maxPlayers?: number;
}

export interface TeamMember {
  id: string;
  player: Player;
  isActive?: boolean;
}

export type PositionType = keyof typeof ALLOWED_POSITIONS;

export function isPitchingPosition(position: Position): boolean {
  return PITCHING_POSITIONS.has(position);
}

export function isBattingPosition(position: Position): boolean {
  return BATTING_POSITIONS.has(position);
}

export function isPitchingSlot(positionSlot: PositionSlot): boolean {
  const allowedPositions = ALLOWED_POSITIONS[positionSlot];
  return allowedPositions.some((pos) => PITCHING_POSITIONS.has(pos));
}

export function isBattingSlot(positionSlot: PositionSlot): boolean {
  const allowedPositions = ALLOWED_POSITIONS[positionSlot];
  return allowedPositions.some((pos) => BATTING_POSITIONS.has(pos));
}

export function isPitcher(player: Player): boolean {
  return player.eligiblePositions.some((pos) =>
    PITCHING_POSITIONS.has(pos.position),
  );
}

export function isBatter(player: Player): boolean {
  return player.eligiblePositions.some((pos) =>
    BATTING_POSITIONS.has(pos.position),
  );
}

export function canPlayerPlayPosition(
  player: Player | undefined,
  positionSlot: PositionSlot | undefined,
): boolean {
  if (!player || !positionSlot) {
    return false;
  }

  const allowedPositions = ALLOWED_POSITIONS[positionSlot];
  if (!allowedPositions) {
    return false;
  }

  return player.eligiblePositions.some((playerPos) =>
    allowedPositions.includes(playerPos.position),
  );
}

export function getPlayerPrimaryPosition(player: Player): Position | undefined {
  const primaryPos = player.eligiblePositions.find((pos) => pos.isPrimary);
  return primaryPos?.position || player.eligiblePositions[0]?.position;
}

export function getPositionDisplayName(positionSlot: PositionSlot): string {
  const displayNames: Record<PositionSlot, string> = {
    [PositionSlot.C]: 'Catcher',
    [PositionSlot['1B']]: 'First Base',
    [PositionSlot['2B']]: 'Second Base',
    [PositionSlot['3B']]: 'Third Base',
    [PositionSlot.SS]: 'Shortstop',
    [PositionSlot.LF]: 'Left Field',
    [PositionSlot.CF]: 'Center Field',
    [PositionSlot.RF]: 'Right Field',
    [PositionSlot.DH]: 'Designated Hitter',
    [PositionSlot.SP]: 'Starting Pitcher',
    [PositionSlot.RP]: 'Relief Pitcher',
    [PositionSlot.IF]: 'Infield',
    [PositionSlot.OF]: 'Outfield',
    [PositionSlot.XDH]: 'Extra DH',
  };

  return displayNames[positionSlot] || positionSlot;
}

export function validateLineup(
  lineup: Array<{ player: Player; position: PositionSlot }>,
  requiredPositions: PositionSlot[],
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const usedPlayers = new Set<string>();
  const filledPositions = new Set<PositionSlot>();

  // Check for duplicate players
  for (const entry of lineup) {
    if (usedPlayers.has(entry.player.id)) {
      errors.push(
        `Player ${entry.player.firstName} ${entry.player.lastName} is used multiple times`,
      );
    }
    usedPlayers.add(entry.player.id);

    // Check if player can play the position
    if (!canPlayerPlayPosition(entry.player, entry.position)) {
      errors.push(
        `${entry.player.firstName} ${entry.player.lastName} cannot play ${getPositionDisplayName(
          entry.position,
        )}`,
      );
    }

    filledPositions.add(entry.position);
  }

  // Check for missing required positions
  for (const requiredPos of requiredPositions) {
    if (!filledPositions.has(requiredPos)) {
      errors.push(
        `Missing required position: ${getPositionDisplayName(requiredPos)}`,
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export default {
  PositionSlot,
  ALLOWED_POSITIONS,
  PITCHING_POSITIONS,
  BATTING_POSITIONS,
  isPitchingPosition,
  isBattingPosition,
  isPitchingSlot,
  isBattingSlot,
  isPitcher,
  isBatter,
  canPlayerPlayPosition,
  getPlayerPrimaryPosition,
  getPositionDisplayName,
  validateLineup,
};

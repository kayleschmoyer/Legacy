import { pgEnum } from 'drizzle-orm/pg-core';

export const accessLevel = pgEnum('access_level', ['none', 'admin']);
export const draftOrder = pgEnum('draft_order', ['snake', 'normal']);
export const draftType = pgEnum('draft_type', ['blind', 'normal', 'legacy']);
export const leaguePermissionLevel = pgEnum('league_permission_level', [
  'owner',
  'commissioner',
]);

export const playerPosition = pgEnum('player_position', [
  'SP',
  'RP',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'RF',
  'LF',
  'CF',
  'DH',
]);

export const positionSlot = pgEnum('position_slot', [
  'SP',
  'RP',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'RF',
  'LF',
  'CF',
  'DH',
  'XDH',
  'OF',
  'IF',
]);

import {
  Player,
  PlayerEligiblePosition,
  TeamMember,
  TeamPosition,
} from '@legacy-sports/db-client';

export const POSITION_MAPPING = Object.freeze<TeamPosition[]>([
  { id: 1, positionType: 'C' },
  { id: 2, positionType: '1B' },
  { id: 3, positionType: '2B' },
  { id: 4, positionType: '3B' },
  { id: 5, positionType: 'SS' },
  { id: 6, positionType: 'OF' },
  { id: 7, positionType: 'OF' },
  { id: 8, positionType: 'OF' },
  { id: 9, positionType: 'DH' },
  { id: 10, positionType: 'SP' },
  { id: 11, positionType: 'SP' },
  { id: 12, positionType: 'SP' },
  { id: 13, positionType: 'SP' },
  { id: 14, positionType: 'SP' },
  { id: 15, positionType: 'RP' },
  { id: 16, positionType: 'RP' },
  { id: 17, positionType: 'RP' },
]);

export const PLAYERS = Object.freeze<Player[]>([
  {
    brefId: 'TC1',
    id: 1,
    name: 'Test Catcher',
  },
  {
    brefId: 'T1B',
    id: 2,
    name: 'Test 1B',
  },
  {
    brefId: 'T2B',
    id: 3,
    name: 'Test 2B',
  },
  {
    brefId: 'T3B',
    id: 4,
    name: 'Test 3B',
  },
  {
    brefId: 'TSS',
    id: 5,
    name: 'Test SS',
  },
  {
    brefId: 'TRG',
    id: 6,
    name: 'Test RF',
  },
  {
    brefId: 'TCF',
    id: 7,
    name: 'Test CF',
  },
  {
    brefId: 'TLF',
    id: 8,
    name: 'Test LF',
  },
  {
    brefId: 'TC2',
    id: 9,
    name: 'Test BACKUP CATCHER',
  },
  {
    brefId: 'T1B2',
    id: 10,
    name: 'Test BACKUP FIRST BASEMAN',
  },
  {
    brefId: 'TOF2',
    id: 11,
    name: 'Test OF2',
  },
  {
    brefId: 'SP1',
    id: 12,
    name: 'SP1',
  },
  {
    brefId: 'SP2',
    id: 13,
    name: 'SP2',
  },
  {
    brefId: 'SP3',
    id: 14,
    name: 'SP3',
  },
  {
    brefId: 'SP4',
    id: 15,
    name: 'SP4',
  },
  {
    brefId: 'SP5',
    id: 16,
    name: 'SP5',
  },
  {
    brefId: 'SP6',
    id: 17,
    name: 'SP6',
  },
  {
    brefId: 'SP7',
    id: 18,
    name: 'SP7',
  },
  {
    brefId: 'RP1',
    id: 19,
    name: 'RP1',
  },
  {
    brefId: 'RP2',
    id: 20,
    name: 'RP2',
  },
  {
    brefId: 'RP3',
    id: 21,
    name: 'RP3',
  },
  {
    brefId: 'TIF',
    id: 22,
    name: 'Test Infielder',
  },
  {
    brefId: 'T3B2',
    id: 23,
    name: 'Test 3B 2',
  },
  {
    brefId: 'TRP4',
    id: 24,
    name: 'RP4',
  },
  {
    brefId: 'TRFLF',
    id: 25,
    name: 'Test RF/LF',
  },
]);

export const ELIGIBLE_POSITIONS = Object.freeze<PlayerEligiblePosition[]>([
  {
    playerId: 1,
    position: 'C',
  },
  {
    playerId: 2,
    position: '1B',
  },
  {
    playerId: 3,
    position: '2B',
  },
  {
    playerId: 4,
    position: '3B',
  },
  {
    playerId: 5,
    position: 'SS',
  },
  {
    playerId: 6,
    position: 'RF',
  },
  {
    playerId: 7,
    position: 'CF',
  },
  {
    playerId: 8,
    position: 'LF',
  },
  {
    playerId: 9,
    position: 'C',
  },
  {
    playerId: 10,
    position: '1B',
  },
  {
    playerId: 11,
    position: 'CF',
  },
  {
    playerId: 12,
    position: 'SP',
  },
  {
    playerId: 13,
    position: 'SP',
  },
  {
    playerId: 14,
    position: 'SP',
  },
  {
    playerId: 15,
    position: 'SP',
  },
  {
    playerId: 16,
    position: 'SP',
  },
  {
    playerId: 17,
    position: 'SP',
  },
  {
    playerId: 18,
    position: 'SP',
  },
  {
    playerId: 19,
    position: 'RP',
  },
  {
    playerId: 20,
    position: 'RP',
  },
  {
    playerId: 21,
    position: 'RP',
  },
  {
    playerId: 22,
    position: 'SS',
  },
  {
    playerId: 22,
    position: '2B',
  },
  {
    playerId: 23,
    position: '3B',
  },
  {
    playerId: 24,
    position: 'RP',
  },
  {
    playerId: 25,
    position: 'LF',
  },
  {
    playerId: 25,
    position: 'RF',
  },
]);

export const TEAM = Object.freeze<TeamMember[]>([
  {
    id: 1,
    leagueId: 1,
    playerId: 1,
    positionId: 1,
    teamId: 1,
  },
  {
    id: 2,
    leagueId: 1,
    playerId: 2,
    positionId: 2,
    teamId: 1,
  },
  {
    id: 3,
    leagueId: 1,
    playerId: 3,
    positionId: 3,
    teamId: 1,
  },
  {
    id: 4,
    leagueId: 1,
    playerId: 4,
    positionId: 4,
    teamId: 1,
  },
  {
    id: 5,
    leagueId: 1,
    playerId: 5,
    positionId: 5,
    teamId: 1,
  },
  {
    id: 6,
    leagueId: 1,
    playerId: 6,
    positionId: 6,
    teamId: 1,
  },
  {
    id: 7,
    leagueId: 1,
    playerId: 7,
    positionId: 7,
    teamId: 1,
  },
  {
    id: 8,
    leagueId: 1,
    playerId: 8,
    positionId: 8,
    teamId: 1,
  },
  {
    id: 9,
    leagueId: 1,
    playerId: 9,
    positionId: 9,
    teamId: 1,
  },
  {
    id: 10,
    leagueId: 1,
    playerId: 10,
    positionId: null,
    teamId: 1,
  },
  {
    id: 11,
    leagueId: 1,
    playerId: 11,
    positionId: null,
    teamId: 1,
  },
  {
    id: 12,
    leagueId: 1,
    playerId: 12,
    positionId: 10,
    teamId: 1,
  },
  {
    id: 13,
    leagueId: 1,
    playerId: 13,
    positionId: 11,
    teamId: 1,
  },
  {
    id: 14,
    leagueId: 1,
    playerId: 14,
    positionId: 12,
    teamId: 1,
  },
  {
    id: 15,
    leagueId: 1,
    playerId: 15,
    positionId: 13,
    teamId: 1,
  },
  {
    id: 16,
    leagueId: 1,
    playerId: 16,
    positionId: 14,
    teamId: 1,
  },
  {
    id: 17,
    leagueId: 1,
    playerId: 17,
    positionId: null,
    teamId: 1,
  },
  {
    id: 18,
    leagueId: 1,
    playerId: 18,
    positionId: null,
    teamId: 1,
  },
  {
    id: 19,
    leagueId: 1,
    playerId: 19,
    positionId: 15,
    teamId: 1,
  },
  {
    id: 20,
    leagueId: 1,
    playerId: 20,
    positionId: 16,
    teamId: 1,
  },
  {
    id: 21,
    leagueId: 1,
    playerId: 21,
    positionId: 17,
    teamId: 1,
  },
  {
    id: 22,
    leagueId: 1,
    playerId: 22,
    positionId: null,
    teamId: 1,
  },
  {
    id: 23,
    leagueId: 1,
    playerId: 23,
    positionId: null,
    teamId: 1,
  },
  {
    id: 24,
    leagueId: 1,
    playerId: 24,
    positionId: null,
    teamId: 1,
  },
  {
    id: 25,
    leagueId: 1,
    playerId: 25,
    positionId: null,
    teamId: 1,
  },
]);

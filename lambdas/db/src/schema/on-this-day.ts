/**
 * On This Day — GraphQL types and query.
 *
 * Returns historically notable batting and pitching game-log performances
 * that occurred on the given calendar month + day across all seasons
 * stored in the database.
 *
 * Also returns baseball events (signings, trades) from the on_this_day_events
 * table populated via the MLB Stats API.
 */
import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { builder } from './builder';

const dbService = createDatabaseService(getDbOptions());

// ─── Object type ─────────────────────────────────────────────────────────────

interface OnThisDayEntryShape {
  entryType: 'batting' | 'pitching';
  playerId: number;
  firstName: string;
  lastName: string;
  brefId: string;
  season: number;
  gameIdentifier: string;
  // Batting
  hr: number | null;
  rbi: number | null;
  hits: number | null;
  doubles: number | null;
  triples: number | null;
  atBats: number | null;
  baseOnBalls: number | null;
  runs: number | null;
  // Pitching
  strikeouts: number | null;
  inningsPitched: number | null;
  earnedRuns: number | null;
  saves: number | null;
  wins: number | null;
  hitsAllowed: number | null;
  walksAllowed: number | null;
}

const OnThisDayEntryRef =
  builder.objectRef<OnThisDayEntryShape>('OnThisDayEntry');

OnThisDayEntryRef.implement({
  description:
    'A historically notable game-log performance on a specific calendar date',
  fields: (t) => ({
    entryType: t.exposeString('entryType', {
      description: '"batting" or "pitching"',
    }),
    playerId: t.exposeInt('playerId'),
    firstName: t.exposeString('firstName'),
    lastName: t.exposeString('lastName'),
    brefId: t.exposeString('brefId', {
      description: 'Baseball-Reference player ID (used to build player URLs)',
    }),
    season: t.exposeInt('season', { description: 'Year of the game' }),
    gameIdentifier: t.exposeString('gameIdentifier', {
      description: 'Baseball-Reference game identifier (encodes date & team)',
    }),
    // Batting
    homeRuns: t.exposeInt('hr', { nullable: true }),
    rbi: t.exposeInt('rbi', { nullable: true }),
    hits: t.exposeInt('hits', { nullable: true }),
    doubles: t.exposeInt('doubles', { nullable: true }),
    triples: t.exposeInt('triples', { nullable: true }),
    atBats: t.exposeInt('atBats', { nullable: true }),
    baseOnBalls: t.exposeInt('baseOnBalls', { nullable: true }),
    runs: t.exposeInt('runs', { nullable: true }),
    // Pitching
    strikeouts: t.exposeInt('strikeouts', { nullable: true }),
    inningsPitched: t.exposeFloat('inningsPitched', { nullable: true }),
    earnedRuns: t.exposeInt('earnedRuns', { nullable: true }),
    saves: t.exposeInt('saves', { nullable: true }),
    wins: t.exposeInt('wins', { nullable: true }),
    hitsAllowed: t.exposeInt('hitsAllowed', { nullable: true }),
    walksAllowed: t.exposeInt('walksAllowed', { nullable: true }),
  }),
});

// ─── Query field ─────────────────────────────────────────────────────────────

builder.queryField('onThisDay', (t) =>
  t.field({
    type: [OnThisDayEntryRef],
    description:
      "Notable historical game-log performances from today's calendar date across all seasons",
    args: {
      month: t.arg.int({
        required: true,
        description: 'Calendar month (1–12)',
      }),
      day: t.arg.int({
        required: true,
        description: 'Calendar day (1–31)',
      }),
      limit: t.arg.int({
        required: false,
        description: 'Maximum number of entries to return (default 15)',
      }),
    },
    resolve: async (_root, { month, day, limit }) => {
      return dbService.statistics.getOnThisDay(month, day, limit ?? 15);
    },
  }),
);

// ─── OnThisDayEvent type ──────────────────────────────────────────────────────

interface OnThisDayEventShape {
  id: number;
  month: number;
  day: number;
  year: number;
  eventType: string;
  description: string;
  playerId: number | null;
  playerName: string | null;
  fromTeam: string | null;
  toTeam: string | null;
}

const OnThisDayEventRef =
  builder.objectRef<OnThisDayEventShape>('OnThisDayEvent');

OnThisDayEventRef.implement({
  description:
    'A historical baseball event (signing, trade) on a calendar date',
  fields: (t) => ({
    id: t.exposeInt('id'),
    month: t.exposeInt('month'),
    day: t.exposeInt('day'),
    year: t.exposeInt('year', { description: 'Year the event occurred' }),
    eventType: t.exposeString('eventType', {
      description: 'MLB transaction type code (e.g. TR, SFA, CE)',
    }),
    description: t.exposeString('description', {
      description: 'Human-readable description of the event',
    }),
    playerId: t.exposeInt('playerId', { nullable: true }),
    playerName: t.exposeString('playerName', { nullable: true }),
    fromTeam: t.exposeString('fromTeam', { nullable: true }),
    toTeam: t.exposeString('toTeam', { nullable: true }),
  }),
});

// ─── onThisDayEvents query ───────────────────────────────────────────────────

builder.queryField('onThisDayEvents', (t) =>
  t.field({
    type: [OnThisDayEventRef],
    description:
      'Baseball events (signings, trades) that occurred on the given calendar date',
    args: {
      month: t.arg.int({
        required: true,
        description: 'Calendar month (1–12)',
      }),
      day: t.arg.int({
        required: true,
        description: 'Calendar day (1–31)',
      }),
      limit: t.arg.int({
        required: false,
        description: 'Maximum number of events to return (default 20)',
      }),
    },
    resolve: async (_root, { month, day, limit }) => {
      return dbService.statistics.getOnThisDayEvents(month, day, limit ?? 20);
    },
  }),
);

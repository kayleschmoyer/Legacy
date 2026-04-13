/**
 * MLB Live Scoreboard — GraphQL schema and resolvers (LS-1865, LS-2326).
 *
 * Defines the types and query fields for live MLB scoreboard data.
 *
 * Frontend component: apps/web/src/components/scoreboard/Scoreboard.tsx (LS-1867)
 * MLB client library: lib/mlb-client (LS-1864)
 */
import { GraphQLError } from 'graphql';
import { createMlbDataProvider } from '@legacy-sports/mlb-client';
import type { MlbDataProvider } from '@legacy-sports/mlb-client';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { builder } from './builder';

// Read env vars at module load so they are stable for the container lifetime.
const MLB_DATA_API_KEY_LOCAL = process.env['MLB_DATA_API_KEY'] ?? '';
const MLB_DATA_API_KEY_SECRET_NAME =
  process.env['MLB_DATA_API_KEY_SECRET_NAME'] ?? '';

// Lazy singleton — initialised on first resolver call (like the Stripe client)
// so the in-memory cache inside the provider is preserved across Lambda
// invocations within the same container lifetime, and so the secret fetch only
// occurs once regardless of how many concurrent requests arrive at cold start.
let mlbDataProviderPromise: Promise<MlbDataProvider> | null = null;

function getMlbDataProvider(): Promise<MlbDataProvider> {
  if (!mlbDataProviderPromise) {
    mlbDataProviderPromise = initMlbDataProvider().catch((error) => {
      // Reset so the next request retries initialisation (e.g. transient SM outage).
      mlbDataProviderPromise = null;
      throw error;
    });
  }
  return mlbDataProviderPromise;
}

async function initMlbDataProvider(): Promise<MlbDataProvider> {
  let apiKey: string | undefined;

  if (MLB_DATA_API_KEY_LOCAL) {
    apiKey = MLB_DATA_API_KEY_LOCAL;
  } else if (MLB_DATA_API_KEY_SECRET_NAME) {
    apiKey = await retrieveSecretParameterValue(MLB_DATA_API_KEY_SECRET_NAME);
  }

  return createMlbDataProvider({ apiKey });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns true only for real calendar dates (rejects 2024-02-31, 2024-13-01, etc.). */
function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const parsed = new Date(y, m - 1, d);
  return (
    parsed.getFullYear() === y &&
    parsed.getMonth() === m - 1 &&
    parsed.getDate() === d
  );
}

// ─── ScoreboardTeam ───────────────────────────────────────────────────────────

export interface ScoreboardTeamShape {
  teamName: string;
  abbreviation: string;
  runs: number;
  hits: number;
  errors: number;
  linescoreInnings: number[] | null;
}

const ScoreboardTeamRef =
  builder.objectRef<ScoreboardTeamShape>('ScoreboardTeam');

ScoreboardTeamRef.implement({
  description: 'Team score and linescore data for a single game',
  fields: (t) => ({
    teamName: t.exposeString('teamName', {
      nullable: false,
      description: 'Full team name',
    }),
    abbreviation: t.exposeString('abbreviation', {
      nullable: false,
      description: 'Three-letter team abbreviation (e.g. NYY, BOS)',
    }),
    runs: t.exposeInt('runs', {
      nullable: false,
      description: 'Total runs scored',
    }),
    hits: t.exposeInt('hits', { nullable: false, description: 'Total hits' }),
    errors: t.exposeInt('errors', {
      nullable: false,
      description: 'Total errors',
    }),
    linescoreInnings: t.exposeIntList('linescoreInnings', {
      nullable: true,
      description: 'Runs scored per inning (index 0 = inning 1)',
    }),
  }),
});

// ─── ScoreboardGame ───────────────────────────────────────────────────────────

export interface ScoreboardGameShape {
  gamePk: number;
  status: string;
  startTime: string | null;
  inning: number | null;
  inningHalf: string | null;
  outs: number | null;
  homeTeam: ScoreboardTeamShape;
  awayTeam: ScoreboardTeamShape;
}

export const ScoreboardGameRef =
  builder.objectRef<ScoreboardGameShape>('ScoreboardGame');

ScoreboardGameRef.implement({
  description: 'A single MLB game on the scoreboard',
  fields: (t) => ({
    gamePk: t.exposeInt('gamePk', {
      nullable: false,
      description: 'MLB primary key for the game',
    }),
    status: t.exposeString('status', {
      nullable: false,
      description:
        'Game status: "Preview", "Live", "Final", "Postponed", or "Suspended"',
    }),
    startTime: t.exposeString('startTime', {
      nullable: true,
      description: 'Scheduled start time (ISO 8601)',
    }),
    inning: t.exposeInt('inning', {
      nullable: true,
      description: 'Current inning number (null for Preview/Final)',
    }),
    inningHalf: t.exposeString('inningHalf', {
      nullable: true,
      description: '"Top" or "Bot" — null for Preview/Final',
    }),
    outs: t.exposeInt('outs', {
      nullable: true,
      description: 'Current number of outs (null for Preview/Final)',
    }),
    homeTeam: t.expose('homeTeam', {
      type: ScoreboardTeamRef,
      nullable: false,
      description: 'Home team score and linescore',
    }),
    awayTeam: t.expose('awayTeam', {
      type: ScoreboardTeamRef,
      nullable: false,
      description: 'Away team score and linescore',
    }),
  }),
});

// ─── Scoreboard ──────────────────────────────────────────────────────────────

interface ScoreboardShape {
  date: string;
  lastUpdated: string;
  games: ScoreboardGameShape[];
}

const ScoreboardRef = builder.objectRef<ScoreboardShape>('Scoreboard');

ScoreboardRef.implement({
  description: 'Live MLB scoreboard data for a single date',
  fields: (t) => ({
    date: t.exposeString('date', {
      description: 'Date of the games (YYYY-MM-DD)',
    }),
    lastUpdated: t.exposeString('lastUpdated', {
      description: 'ISO 8601 timestamp of the last data refresh',
    }),
    games: t.expose('games', {
      type: [ScoreboardGameRef],
      description: 'All games scheduled for this date',
    }),
  }),
});

// ─── Query: scoreboard ───────────────────────────────────────────────────────

builder.queryField('scoreboard', (t) =>
  t.field({
    type: ScoreboardRef,
    nullable: true,
    description:
      'Live MLB scoreboard for the given date (defaults to today). ' +
      'Uses the provider configured via MLB_DATA_PROVIDER (defaults to mlb-statsapi in dev).',
    args: {
      date: t.arg.string({
        required: false,
        description:
          'Date in YYYY-MM-DD format. Defaults to today in the US/Eastern timezone.',
      }),
    },
    resolve: async (_root, _args) => {
      const date =
        _args.date ??
        new Date().toLocaleDateString('en-CA', {
          timeZone: 'America/New_York',
        });

      if (!isValidDate(date)) {
        throw new GraphQLError(
          'Invalid date format. Use YYYY-MM-DD (e.g. "2024-07-04").',
          { extensions: { code: 'BAD_USER_INPUT' } },
        );
      }

      try {
        const provider = await getMlbDataProvider();
        return await provider.getScoreboard(date);
      } catch (err) {
        LOGGER.error('Scoreboard provider error', {
          date,
          error:
            err instanceof Error
              ? { message: err.message, stack: err.stack }
              : String(err),
        });
        throw new GraphQLError(
          'Failed to fetch scoreboard data. Please try again.',
          { extensions: { code: 'INTERNAL_SERVER_ERROR' } },
        );
      }
    },
  }),
);

// ─── Query: game ─────────────────────────────────────────────────────────────

builder.queryField('game', (t) =>
  t.field({
    type: ScoreboardGameRef,
    nullable: true,
    description:
      'Detailed state for a single MLB game by its primary key (gamePk). ' +
      'Returns null until LS-1864 delivers @legacy-sports/mlb-client.',
    args: {
      gamePk: t.arg.int({
        required: true,
        description: 'MLB primary key for the game',
      }),
    },
    resolve: (_root, _args) => {
      // TODO(LS-1864): replace with createMlbDataProvider().getGame(_args.gamePk)
      return null;
    },
  }),
);

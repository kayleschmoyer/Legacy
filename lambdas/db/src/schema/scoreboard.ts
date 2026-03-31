/**
 * MLB Live Scoreboard — GraphQL type definitions (schema contract).
 *
 * Defines the types and query field for the live scoreboard.
 * The resolver stub returns null until LS-1865 wires up the actual
 * MlbDataProvider implementation.
 *
 * Frontend component: apps/web/src/components/scoreboard/Scoreboard.tsx (LS-1867)
 * Resolver implementation: LS-1865
 * MLB client library: lib/mlb-client (LS-1864)
 */
import { builder } from './builder';

// ─── ScoreboardTeam ───────────────────────────────────────────────────────────

interface ScoreboardTeamShape {
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

interface ScoreboardGameShape {
  gamePk: number;
  status: string;
  startTime: string | null;
  inning: number | null;
  inningHalf: string | null;
  outs: number | null;
  homeTeam: ScoreboardTeamShape;
  awayTeam: ScoreboardTeamShape;
}

const ScoreboardGameRef =
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
      description: 'Game status: "Preview", "Live", or "Final"',
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

// ─── Query field ─────────────────────────────────────────────────────────────

builder.queryField('scoreboard', (t) =>
  t.field({
    type: ScoreboardRef,
    nullable: true,
    description:
      'Live MLB scoreboard for the given date (defaults to today). ' +
      'Resolver stub — full implementation added in LS-1865 via MlbDataProvider.',
    args: {
      date: t.arg.string({
        required: false,
        description:
          'Date in YYYY-MM-DD format. Defaults to today in the US/Eastern timezone.',
      }),
    },
    resolve: () => {
      // Stub resolver — returns null until LS-1865 wires up MlbDataProvider.
      // The frontend component (LS-1867) handles the null case gracefully.
      return null;
    },
  }),
);

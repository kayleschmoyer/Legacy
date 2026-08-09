/**
 * Player notable-play cache — GraphQL schema and resolvers (LS-9095).
 *
 * Serves the draft spectator pick-splash stat graphic: each drafted player's
 * most notable Statcast play (best exit-velo hit, strikeout, …) is precomputed
 * into the player_notable_plays cache table so the ~8s splash window only ever
 * does a cache read — never a live statsapi lookup.
 *
 * Two surfaces:
 *  - Query notablePlaysByMlbPlayerIds — public batch read for the splash.
 *  - Mutation refreshNotablePlays — system-only (EventBridge, daily); scans
 *    recent final games via the configured MlbDataProvider and upserts each
 *    player's best play. Degrades to triggered:false when the configured
 *    provider has no play-level feed support (e.g. licensed providers that
 *    don't expose Statcast data) or when provider construction fails (the
 *    mlb-statsapi production guard).
 *
 * ToS compliance (spike LS-8945): only stat summaries and the Statcast play
 * UUID are stored. filmRoomUrl is a link-out to MLB's own property built from
 * that UUID — no MLB video is embedded, proxied, or rehosted.
 */

import { createDatabaseService } from '@legacy-sports/db-client';
import type { PlayerNotablePlayRow } from '@legacy-sports/db-client';
import type { MlbDataProvider, NotablePlay } from '@legacy-sports/mlb-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';

import { builder, type Context } from './builder';
import { UserInputError } from './graphql-errors';
import { assertAuthorized } from './matchups/system-auth';
import { getMlbDataProvider } from './scoreboard';

const dbService = createDatabaseService(getDbOptions());

/** Max ids per batch query — the splash never needs more than a draft board. */
const MAX_QUERY_IDS = 500;
/** Default schedule lookback — daily cadence plus one day of overlap. */
const DEFAULT_LOOKBACK_DAYS = 2;
const MAX_LOOKBACK_DAYS = 14;

/**
 * MLB Film Room search URL for a Statcast play UUID — a user-initiated
 * link-out to MLB's own property, never an embed (LS-8945 ToS constraint).
 */
export function filmRoomUrlForPlayId(playId: string): string {
  return `https://www.mlb.com/video/search?q=playid=${encodeURIComponent(`"${playId}"`)}`;
}

/** Date string (YYYY-MM-DD) n days before today in US/Eastern. */
function easternDateDaysAgo(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// ─── PlayerNotablePlay ───────────────────────────────────────────────────────

export const PlayerNotablePlayRef =
  builder.objectRef<PlayerNotablePlayRow>('PlayerNotablePlay');

PlayerNotablePlayRef.implement({
  description:
    "A player's cached most-notable Statcast play, shown as the pick-splash " +
    'stat graphic on the draft spectator page (LS-9095)',
  fields: (t) => ({
    mlbPlayerId: t.exposeInt('mlbPlayerId', {
      description: 'MLB Stats API player id the play belongs to',
    }),
    playerRole: t.exposeString('playerRole', {
      description: "Role the play is notable for: 'batter' or 'pitcher'",
    }),
    gamePk: t.exposeInt('gamePk', {
      description: 'MLB primary key of the game the play occurred in',
    }),
    gameDate: t.exposeString('gameDate', {
      description: 'Official game date (YYYY-MM-DD)',
    }),
    eventType: t.exposeString('eventType', {
      description: "MLB event type code, e.g. 'home_run', 'strikeout'",
    }),
    description: t.exposeString('description', {
      description: 'Human-readable play description from the game feed',
    }),
    exitVelocity: t.exposeFloat('exitVelocity', {
      nullable: true,
      description: 'Exit velocity in mph (batter plays only)',
    }),
    launchAngle: t.exposeFloat('launchAngle', {
      nullable: true,
      description: 'Launch angle in degrees (batter plays only)',
    }),
    hitDistance: t.exposeFloat('hitDistance', {
      nullable: true,
      description: 'Hit distance in feet (batter plays only)',
    }),
    pitchSpeed: t.exposeFloat('pitchSpeed', {
      nullable: true,
      description: 'Pitch speed in mph (pitcher plays only)',
    }),
    pitchType: t.exposeString('pitchType', {
      nullable: true,
      description: "Pitch type, e.g. 'Four-Seam Fastball' (pitcher plays only)",
    }),
    filmRoomUrl: t.string({
      nullable: true,
      description:
        'MLB Film Room search link for this play — a user-initiated outbound ' +
        "link to MLB's own property (never an embedded video). Null when the " +
        'game feed carried no Statcast play id.',
      resolve: (play) =>
        play.playId ? filmRoomUrlForPlayId(play.playId) : null,
    }),
  }),
});

// ─── Query: notablePlaysByMlbPlayerIds ───────────────────────────────────────

builder.queryField('notablePlaysByMlbPlayerIds', (t) =>
  t.field({
    type: [PlayerNotablePlayRef],
    description:
      'Cached notable plays for a set of MLB Stats API player ids. Players ' +
      'without a cached play are simply absent from the result.',
    args: {
      mlbPlayerIds: t.arg.intList({ required: true }),
    },
    resolve: async (_root, args) => {
      if (args.mlbPlayerIds.length > MAX_QUERY_IDS) {
        throw UserInputError(
          `Too many mlbPlayerIds — maximum ${MAX_QUERY_IDS} per request.`,
        );
      }
      return dbService.players.getNotablePlaysByMlbIds(args.mlbPlayerIds);
    },
  }),
);

// ─── Mutation: refreshNotablePlays ───────────────────────────────────────────

export interface NotablePlayRefreshResultShape {
  triggered: boolean;
  reason: string;
  gamesScanned: number;
  playersUpdated: number;
  errors: string[];
}

const NotablePlayRefreshResult =
  builder.objectRef<NotablePlayRefreshResultShape>('NotablePlayRefreshResult');

builder.objectType(NotablePlayRefreshResult, {
  description:
    'Result of the scheduled notable-play cache refresh triggered by EventBridge',
  fields: (t) => ({
    triggered: t.exposeBoolean('triggered', {
      description:
        'Whether the refresh ran (false when the configured provider has no play-level feed support)',
    }),
    reason: t.exposeString('reason', {
      description: 'Human-readable explanation of the outcome',
    }),
    gamesScanned: t.exposeInt('gamesScanned', {
      description: 'Number of final games whose feeds were scanned',
    }),
    playersUpdated: t.exposeInt('playersUpdated', {
      description: 'Number of player cache rows inserted or updated',
    }),
    errors: t.exposeStringList('errors'),
  }),
});

export async function resolveRefreshNotablePlays(
  context: Context,
  lookbackDays: number | null | undefined,
): Promise<NotablePlayRefreshResultShape> {
  await assertAuthorized(context, null);

  const days = Math.min(
    Math.max(lookbackDays ?? DEFAULT_LOOKBACK_DAYS, 1),
    MAX_LOOKBACK_DAYS,
  );

  let provider: MlbDataProvider;
  try {
    provider = await getMlbDataProvider();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    LOGGER.warn('[refreshNotablePlays] provider unavailable — skipping', {
      message,
    });
    return {
      triggered: false,
      reason: `MLB data provider unavailable: ${message}`,
      gamesScanned: 0,
      playersUpdated: 0,
      errors: [],
    };
  }

  const getNotablePlays = provider.getNotablePlays?.bind(provider);
  if (getNotablePlays === undefined) {
    LOGGER.info(
      '[refreshNotablePlays] configured provider has no play-level feed support — skipping (no-op)',
    );
    return {
      triggered: false,
      reason:
        'Configured MLB data provider does not support play-level Statcast feeds',
      gamesScanned: 0,
      playersUpdated: 0,
      errors: [],
    };
  }

  const errors: string[] = [];
  let gamesScanned = 0;
  const best = new Map<number, NotablePlay>();

  for (let daysAgo = 1; daysAgo <= days; daysAgo++) {
    const date = easternDateDaysAgo(daysAgo);
    let finalGamePks: number[];
    try {
      const schedule = await provider.getSchedule(date);
      finalGamePks = schedule.games
        .filter((g) => g.status === 'Final')
        .map((g) => g.gamePk);
    } catch (err) {
      errors.push(
        `schedule ${date}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    for (const gamePk of finalGamePks) {
      try {
        const plays = await getNotablePlays(gamePk);
        gamesScanned++;
        for (const play of plays) {
          const existing = best.get(play.mlbPlayerId);
          if (!existing || play.notabilityScore > existing.notabilityScore) {
            best.set(play.mlbPlayerId, play);
          }
        }
      } catch (err) {
        errors.push(
          `game ${gamePk}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  let playersUpdated = 0;
  if (best.size > 0) {
    const knownIds = new Set(
      await dbService.players.filterKnownMlbPlayerIds([...best.keys()]),
    );
    const upserts = [...best.values()].filter((p) =>
      knownIds.has(p.mlbPlayerId),
    );
    playersUpdated = await dbService.players.upsertNotablePlays(upserts);
  }

  LOGGER.info('[refreshNotablePlays] refresh complete', {
    lookbackDays: days,
    gamesScanned,
    candidatePlayers: best.size,
    playersUpdated,
    errorCount: errors.length,
  });

  return {
    triggered: true,
    reason: `Scanned ${gamesScanned} final game(s) over ${days} day(s)`,
    gamesScanned,
    playersUpdated,
    errors,
  };
}

// Triggered daily at 09:00 UTC by EventBridge (after the last West Coast
// games go final). The rule stays enabled year-round; off-season days simply
// scan zero final games.
builder.mutationField('refreshNotablePlays', (t) =>
  t.field({
    type: NotablePlayRefreshResult,
    description:
      "Refresh the per-player notable-play cache from recent final games' " +
      'feed data. Triggered daily by EventBridge; system-only. No-ops when ' +
      'the configured MLB data provider has no play-level feed support.',
    args: {
      lookbackDays: t.arg.int({
        required: false,
        description: `Days of schedule history to scan (default ${DEFAULT_LOOKBACK_DAYS}, max ${MAX_LOOKBACK_DAYS})`,
      }),
    },
    resolve: (_parent, args, context) =>
      resolveRefreshNotablePlays(context, args.lookbackDays),
  }),
);

/**
 * Player highlight-video cache — GraphQL schema and resolvers (LS-9113).
 *
 * Serves the draft spectator pick-splash YouTube video tier: each player's
 * validated MLB-official-channel highlight video is precomputed into the
 * player_highlight_videos cache table so the splash only ever does a cache
 * read. Players without a validated video fall back to the LS-9095 stat
 * graphic tier.
 *
 * Three surfaces:
 *  - Query highlightVideosByPlayerIds — public batch read for the splash.
 *    Only resolved, embeddable, non-Made-for-Kids rows are served.
 *  - Mutation resolveHighlightVideos — system-only (EventBridge, nightly).
 *    Budget-aware: at most RESOLVE_SEARCH_BUDGET search.list calls per run
 *    (the API's dedicated 100/day bucket), prioritizing upcoming/active
 *    draft pools, then recently drafted players. Validation before caching:
 *    full-"First Last" title match auto-accepts; a last-name-only match must
 *    pass the LLM relevance judge; otherwise the player is marked unresolved.
 *  - Mutation verifyHighlightVideos — system-only (EventBridge, weekly).
 *    Batched videos.list (1 unit / 50 ids) re-confirms embeddable +
 *    madeForKids, refreshes titles, purges rows for deleted/private/
 *    no-longer-embeddable videos, and purges anything unverified for 30+
 *    days (YouTube DP III.E.4.d/e cache-refresh obligation).
 *
 * ToS compliance notes: madeForKids=true videos are excluded outright
 * (DP III.E.4.j — simplest compliant behavior); embedding itself is the
 * YouTube-sanctioned IFrame player (rightsholder-uploaded, embed-enabled
 * videos on MLB's own channel) — distinct from the MLB-owned surfaces ruled
 * out by LS-8945.
 */

import { createDatabaseService } from '@legacy-sports/db-client';
import type {
  HighlightVideoCandidate,
  HighlightVideoResolution,
  HighlightVideoVerification,
  PlayerHighlightVideoRow,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';

import { judgeRelevance, matchTitle } from './relevance';
import {
  getVideoStatuses,
  getYouTubeApiKey,
  isQuotaError,
  searchMlbChannelHighlights,
  VIDEOS_LIST_BATCH_SIZE,
} from './youtube-api';
import { builder, type Context } from '../builder';
import { UserInputError } from '../graphql-errors';
import { assertAuthorized } from '../matchups/system-auth';

const dbService = createDatabaseService(getDbOptions());

/** Max ids per batch query — the splash never needs more than a draft board. */
const MAX_QUERY_IDS = 500;
/**
 * Per-run search.list ceiling. The bucket allows 100/day; 95 leaves headroom
 * for ad-hoc manual runs without tripping quota errors mid-job.
 */
export const RESOLVE_SEARCH_BUDGET = 95;
/** Cache rows must be re-verified or purged within this window (DP III.E.4.d/e). */
const CACHE_MAX_AGE_DAYS = 30;

// ─── PlayerHighlightVideo ───────────────────────────────────────────────────

export const PlayerHighlightVideoRef = builder.objectRef<
  Pick<PlayerHighlightVideoRow, 'playerId' | 'youtubeVideoId' | 'videoTitle'>
>('PlayerHighlightVideo');

PlayerHighlightVideoRef.implement({
  description:
    "A player's validated MLB-official-YouTube-channel highlight video, " +
    'shown as the pick-splash video tier on the draft spectator page ' +
    '(LS-9113). Only embeddable, non-Made-for-Kids videos are ever served.',
  fields: (t) => ({
    playerId: t.exposeInt('playerId', {
      description: 'players.id the video belongs to',
    }),
    youtubeVideoId: t.string({
      nullable: true,
      description: 'YouTube video id for the official IFrame embed',
      resolve: (row) => row.youtubeVideoId,
    }),
    videoTitle: t.string({
      nullable: true,
      description: 'Video title as of the last verification pass',
      resolve: (row) => row.videoTitle,
    }),
  }),
});

// ─── Query: highlightVideosByPlayerIds ──────────────────────────────────────

builder.queryField('highlightVideosByPlayerIds', (t) =>
  t.field({
    type: [PlayerHighlightVideoRef],
    description:
      'Cached validated highlight videos for a set of players (players.id). ' +
      'Players without a validated video are simply absent from the result — ' +
      'the splash then uses the stat-graphic tier.',
    args: {
      playerIds: t.arg.intList({ required: true }),
    },
    resolve: async (_root, args) => {
      if (args.playerIds.length > MAX_QUERY_IDS) {
        throw UserInputError(
          `Too many playerIds — maximum ${MAX_QUERY_IDS} per request.`,
        );
      }
      return dbService.players.getHighlightVideosByPlayerIds(args.playerIds);
    },
  }),
);

// ─── Mutation: resolveHighlightVideos ───────────────────────────────────────

export interface HighlightVideoResolveResultShape {
  triggered: boolean;
  reason: string;
  searchesUsed: number;
  playersResolved: number;
  playersUnresolved: number;
  errors: string[];
}

const HighlightVideoResolveResult =
  builder.objectRef<HighlightVideoResolveResultShape>(
    'HighlightVideoResolveResult',
  );

builder.objectType(HighlightVideoResolveResult, {
  description:
    'Result of the scheduled highlight-video resolution run triggered by EventBridge',
  fields: (t) => ({
    triggered: t.exposeBoolean('triggered', {
      description:
        'Whether the run executed (false when no API key is configured)',
    }),
    reason: t.exposeString('reason', {
      description: 'Human-readable explanation of the outcome',
    }),
    searchesUsed: t.exposeInt('searchesUsed', {
      description: 'search.list calls consumed from the daily 100-call bucket',
    }),
    playersResolved: t.exposeInt('playersResolved', {
      description: 'Players cached with a validated video this run',
    }),
    playersUnresolved: t.exposeInt('playersUnresolved', {
      description:
        'Players marked unresolved (no validated match — graphic fallback)',
    }),
    errors: t.exposeStringList('errors'),
  }),
});

/**
 * Resolve one player's search hits to a validated video, or null.
 * The statuses map already excludes nothing — filtering happens here so the
 * exclusion reasons stay in one place.
 */
async function pickValidatedVideo(
  candidate: HighlightVideoCandidate,
  hits: Array<{ videoId: string; title: string }>,
): Promise<{
  videoId: string;
  title: string;
  matchMethod: 'full_name' | 'judge';
} | null> {
  if (hits.length === 0) return null;
  // One videos.list call covers all hits — status.embeddable and
  // status.madeForKids are mandatory checks (DP III.E.4.j) before caching.
  const statuses = await getVideoStatuses(hits.map((h) => h.videoId));
  for (const hit of hits) {
    const status = statuses.get(hit.videoId);
    if (!status || !status.isPublic || !status.embeddable) continue;
    // Made-for-Kids videos are excluded from resolution outright.
    if (status.madeForKids) continue;
    const title = status.title ?? hit.title;
    const match = matchTitle(title, candidate.firstName, candidate.lastName);
    if (match === 'full_name') {
      return { videoId: hit.videoId, title, matchMethod: 'full_name' };
    }
    if (match === 'last_name') {
      const relevant = await judgeRelevance({
        videoTitle: title,
        playerName: `${candidate.firstName} ${candidate.lastName}`,
        firstSeason: candidate.firstSeason,
        lastSeason: candidate.lastSeason,
        mlbTeam: candidate.mlbTeam,
      });
      if (relevant) {
        return { videoId: hit.videoId, title, matchMethod: 'judge' };
      }
    }
  }
  return null;
}

export async function resolveResolveHighlightVideos(
  context: Context,
  searchBudget: number | null | undefined,
): Promise<HighlightVideoResolveResultShape> {
  await assertAuthorized(context, null);

  const budget = Math.min(
    Math.max(searchBudget ?? RESOLVE_SEARCH_BUDGET, 1),
    RESOLVE_SEARCH_BUDGET,
  );

  // Graceful no-op when no key is configured (mirrors the notable-plays
  // provider guard) — the rule stays enabled and skips are observable.
  try {
    await getYouTubeApiKey();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    LOGGER.warn(
      '[resolveHighlightVideos] YouTube API key unavailable — skipping',
      {
        message,
      },
    );
    return {
      triggered: false,
      reason: `YouTube API key unavailable: ${message}`,
      searchesUsed: 0,
      playersResolved: 0,
      playersUnresolved: 0,
      errors: [],
    };
  }

  const errors: string[] = [];
  let searchesUsed = 0;
  const resolutions: HighlightVideoResolution[] = [];
  let playersResolved = 0;
  let playersUnresolved = 0;

  let candidates: HighlightVideoCandidate[];
  try {
    candidates =
      await dbService.players.getHighlightVideoResolutionCandidates(budget);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      triggered: false,
      reason: `Candidate selection failed: ${message}`,
      searchesUsed: 0,
      playersResolved: 0,
      playersUnresolved: 0,
      errors: [message],
    };
  }

  for (const candidate of candidates) {
    if (searchesUsed >= budget) break;
    const playerName = `${candidate.firstName} ${candidate.lastName}`;
    try {
      searchesUsed++;
      const hits = await searchMlbChannelHighlights(playerName);
      const validated = await pickValidatedVideo(candidate, hits);
      if (validated) {
        playersResolved++;
        resolutions.push({
          playerId: candidate.playerId,
          youtubeVideoId: validated.videoId,
          videoTitle: validated.title,
          madeForKids: false,
          embeddable: true,
          matchMethod: validated.matchMethod,
        });
      } else {
        playersUnresolved++;
        resolutions.push({
          playerId: candidate.playerId,
          youtubeVideoId: null,
          videoTitle: null,
          madeForKids: null,
          embeddable: null,
          matchMethod: null,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`player ${candidate.playerId} (${playerName}): ${message}`);
      if (isQuotaError(err)) {
        // Daily search bucket exhausted — further calls are pointless.
        errors.push('search quota exhausted — stopping run');
        break;
      }
    }
  }

  let upserted = 0;
  try {
    upserted =
      await dbService.players.upsertHighlightVideoResolutions(resolutions);
  } catch (err) {
    errors.push(`upsert: ${err instanceof Error ? err.message : String(err)}`);
  }

  LOGGER.info('[resolveHighlightVideos] run complete', {
    candidates: candidates.length,
    searchesUsed,
    playersResolved,
    playersUnresolved,
    upserted,
    errorCount: errors.length,
  });

  return {
    triggered: true,
    reason: `Attempted ${searchesUsed} player(s): ${playersResolved} resolved, ${playersUnresolved} unresolved`,
    searchesUsed,
    playersResolved,
    playersUnresolved,
    errors,
  };
}

// Triggered nightly at 09:30 UTC by EventBridge (after the notable-plays
// refresh). With only ~331 ever-drafted players, a ≤95/night trickle clears
// any realistic pool within days; steady state re-resolves only purged rows.
builder.mutationField('resolveHighlightVideos', (t) =>
  t.field({
    type: HighlightVideoResolveResult,
    description:
      'Resolve players to validated MLB-channel highlight videos, budgeted ' +
      `to at most ${RESOLVE_SEARCH_BUDGET} search.list calls per run. ` +
      'Triggered nightly by EventBridge; system-only.',
    args: {
      searchBudget: t.arg.int({
        required: false,
        description: `search.list calls to spend (default and max ${RESOLVE_SEARCH_BUDGET})`,
      }),
    },
    resolve: (_parent, args, context) =>
      resolveResolveHighlightVideos(context, args.searchBudget),
  }),
);

// ─── Mutation: verifyHighlightVideos ────────────────────────────────────────

export interface HighlightVideoVerifyResultShape {
  triggered: boolean;
  reason: string;
  videosChecked: number;
  videosVerified: number;
  videosPurged: number;
  stalePurged: number;
  errors: string[];
}

const HighlightVideoVerifyResult =
  builder.objectRef<HighlightVideoVerifyResultShape>(
    'HighlightVideoVerifyResult',
  );

builder.objectType(HighlightVideoVerifyResult, {
  description:
    'Result of the scheduled highlight-video verification pass triggered by EventBridge',
  fields: (t) => ({
    triggered: t.exposeBoolean('triggered'),
    reason: t.exposeString('reason'),
    videosChecked: t.exposeInt('videosChecked', {
      description: 'Resolved cache rows checked via batched videos.list',
    }),
    videosVerified: t.exposeInt('videosVerified', {
      description: 'Rows confirmed still embeddable and metadata-refreshed',
    }),
    videosPurged: t.exposeInt('videosPurged', {
      description:
        'Rows purged (video deleted, private, no longer embeddable, or flipped Made-for-Kids)',
    }),
    stalePurged: t.exposeInt('stalePurged', {
      description: `Rows purged for exceeding the ${CACHE_MAX_AGE_DAYS}-day unverified window`,
    }),
    errors: t.exposeStringList('errors'),
  }),
});

export async function resolveVerifyHighlightVideos(
  context: Context,
): Promise<HighlightVideoVerifyResultShape> {
  await assertAuthorized(context, null);

  const errors: string[] = [];
  let videosChecked = 0;
  let videosVerified = 0;
  let videosPurged = 0;

  try {
    await getYouTubeApiKey();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    LOGGER.warn(
      '[verifyHighlightVideos] YouTube API key unavailable — skipping',
      {
        message,
      },
    );
    return {
      triggered: false,
      reason: `YouTube API key unavailable: ${message}`,
      videosChecked: 0,
      videosVerified: 0,
      videosPurged: 0,
      stalePurged: 0,
      errors: [],
    };
  }

  try {
    const rows = await dbService.players.getHighlightVideosForVerification();
    const verifications: HighlightVideoVerification[] = [];
    const purgeIds: number[] = [];

    for (let i = 0; i < rows.length; i += VIDEOS_LIST_BATCH_SIZE) {
      const chunk = rows.slice(i, i + VIDEOS_LIST_BATCH_SIZE);
      try {
        const statuses = await getVideoStatuses(
          chunk.map((r) => r.youtubeVideoId),
        );
        for (const row of chunk) {
          videosChecked++;
          const status = statuses.get(row.youtubeVideoId);
          if (
            !status ||
            !status.isPublic ||
            !status.embeddable ||
            status.madeForKids
          ) {
            purgeIds.push(row.playerId);
          } else {
            verifications.push({
              playerId: row.playerId,
              videoTitle: status.title,
              madeForKids: status.madeForKids,
              embeddable: status.embeddable,
            });
          }
        }
      } catch (err) {
        // Leave this chunk untouched — unverified rows age out via the
        // stale purge rather than being wrongly deleted on a flaky call.
        errors.push(
          `videos.list chunk ${i / VIDEOS_LIST_BATCH_SIZE}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    videosVerified =
      await dbService.players.applyHighlightVideoVerifications(verifications);
    videosPurged = await dbService.players.purgeHighlightVideos(purgeIds);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      triggered: false,
      reason: `Verification failed: ${message}`,
      videosChecked,
      videosVerified,
      videosPurged,
      stalePurged: 0,
      errors: [message],
    };
  }

  let stalePurged = 0;
  try {
    stalePurged =
      await dbService.players.purgeStaleHighlightVideos(CACHE_MAX_AGE_DAYS);
  } catch (err) {
    errors.push(
      `stale purge: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  LOGGER.info('[verifyHighlightVideos] pass complete', {
    videosChecked,
    videosVerified,
    videosPurged,
    stalePurged,
    errorCount: errors.length,
  });

  return {
    triggered: true,
    reason: `Checked ${videosChecked} video(s): ${videosVerified} verified, ${videosPurged} purged`,
    videosChecked,
    videosVerified,
    videosPurged,
    stalePurged,
    errors,
  };
}

// Triggered weekly (Mondays 10:00 UTC) by EventBridge — comfortably inside
// the 30-day cache-refresh obligation, cheap (1 quota unit per 50 videos
// from the 10k general pool).
builder.mutationField('verifyHighlightVideos', (t) =>
  t.field({
    type: HighlightVideoVerifyResult,
    description:
      'Re-verify cached highlight videos via batched videos.list, refresh ' +
      'metadata, and purge invalid or stale rows. Triggered weekly by ' +
      'EventBridge; system-only.',
    resolve: (_parent, _args, context) => resolveVerifyHighlightVideos(context),
  }),
);

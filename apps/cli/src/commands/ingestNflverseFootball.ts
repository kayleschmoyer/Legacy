import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  buildDefenseIdpRows,
  buildGameIdIndex,
  buildGsisToPfrCrosswalk,
  buildKickingRows,
  buildPassingRows,
  buildPlayerObjectKey,
  buildReceivingRows,
  buildRushingRows,
  buildTeamDefenseGames,
  buildTeamDefenseObjectKey,
  NFLVERSE_PAYLOAD_VERSION,
  type NflversePlayerSeasonPayload,
  type NflverseRow,
  parseNflverseCsv,
} from '@legacy-sports/football-game-stats-provider';
import { LOGGER } from '@legacy-sports/logging';
import { gzipSync } from 'node:zlib';

/**
 * Stage the nflverse football corpus in S3, one object per (pfrId, season)
 * for player categories and one per (nflTeam, season) for team defense.
 *
 * Replaces per-player Pro Football Reference scraping as the bulk source for
 * game-level football stats from 1999 onward (LS-9989). nflverse publishes the
 * current season's weekly stats during the season, so the in-season refresh is
 * documented in .agents/skills/dev-environment/references/cli-commands.md.
 *
 * Mirrors `apps/cli/src/commands/ingestRetrosheet.ts` (LS-9817) structurally; see
 * `terraform/main/football-corpus.tf` for the bucket this writes to and
 * `docs/decisions/0022-football-per-game-stats-source.md` for why nflverse
 * (not PFR) is the source for this range.
 *
 * Data source and attribution: nflverse-data is licensed CC-BY 4.0
 * (https://github.com/nflverse/nflverse-data/blob/master/LICENSE.md).
 * Attribution: "nflverse" (https://nflverse.com).
 */

const NFLVERSE_RELEASE_BASE =
  'https://github.com/nflverse/nflverse-data/releases/download';
const PLAYERS_URL = `${NFLVERSE_RELEASE_BASE}/players/players.csv`;
const SCHEDULES_URL = `${NFLVERSE_RELEASE_BASE}/schedules/games.csv`;
// `stats_player` is the canonical release for these files. The similarly
// named `player_stats` release mirrors only some of them and lacks 2002, 2019
// and 2025 — those 404'd in a real dry-run (LS-10224).
export const weeklyStatsUrl = (season: number) =>
  `${NFLVERSE_RELEASE_BASE}/stats_player/stats_player_week_${season}.csv`;

/**
 * A season whose download fails is skipped so the remaining seasons still
 * land (same as ingest-retrosheet), but the run must not then report success:
 * an operator would ship a corpus with whole seasons missing and exit 0
 * (LS-10224). Throwing here lets the CLI's top-level handler log it and exit 1.
 */
export function assertNoFailedSeasons(failedSeasons: number[]): void {
  if (failedSeasons.length === 0) return;
  throw new Error(
    `nflverse ingest incomplete: ${failedSeasons.length} season(s) failed to download: ` +
      `${failedSeasons.join(', ')}. Objects for every other season were written; ` +
      're-run the same command to fill the gaps (existing objects are skipped unless --force).',
  );
}

/** nflverse's unified weekly stats file starts at 1999 (play-by-play does
 * not exist before that — the league's own digitization limit, ADR 0022). */
export const FIRST_SEASON = 1999;

const FETCH_TIMEOUT_MS = 120_000;

export interface IngestNflverseFootballArgs {
  bucket?: string;
  prefix?: string;
  from?: number;
  to?: number;
  /** Re-upload objects that already exist (default: skip them). */
  force?: boolean;
  /** Parse and report without writing to S3. */
  dryRun?: boolean;
}

class HttpStatusError extends Error {
  constructor(
    url: string,
    readonly status: number,
  ) {
    super(`GET ${url} failed: ${status}`);
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new HttpStatusError(url, response.status);
  }
  return response.text();
}

/**
 * Fetch one season's weekly stats CSV, or `null` when nflverse has no file for
 * it (HTTP 404). Any other failure still throws.
 *
 * A 404 is only expected for the in-progress season, whose file is posted once
 * the season is under way (LS-10223). The `stats_player` release covers every
 * completed season from 1999, so a 404 for one of those is a failure the caller
 * must surface (LS-10224) — the earlier "2002 is a gap year" reading came from
 * the `player_stats` release, which was the wrong tag.
 */
export async function fetchWeeklyStatsCsv(
  season: number,
  fetchImpl: (url: string) => Promise<string> = fetchText,
): Promise<string | null> {
  try {
    return await fetchImpl(weeklyStatsUrl(season));
  } catch (error) {
    if (error instanceof HttpStatusError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Season range
// ---------------------------------------------------------------------------

/**
 * The NFL season in progress (or most recently started) at `now`.
 *
 * nflverse labels a season by the calendar year it starts in, and the regular
 * season opens in September and runs into February of the following year. So
 * between January and August the current season is still last calendar year's.
 */
export function currentNflSeason(now: Date): number {
  const year = now.getUTCFullYear();
  // getUTCMonth() is 0-based: 8 === September.
  return now.getUTCMonth() >= 8 ? year : year - 1;
}

export type SeasonRange =
  | { ok: true; from: number; to: number }
  | { ok: false; error: string };

/**
 * Resolve --from/--to against the current date (LS-10235).
 *
 * Unlike Retrosheet (LS-10232), nflverse publishes the current season's weekly
 * stats *during* the season, so the default upper bound is the current season
 * rather than last year. Seasons beyond it cannot exist and are clamped away;
 * the in-progress season's file may not be posted yet, which 404s and the
 * season loop skips it (see `fetchWeeklyStatsCsv`).
 */
export function resolveSeasonRange(
  args: Pick<IngestNflverseFootballArgs, 'from' | 'to'>,
  now: Date = new Date(),
): SeasonRange {
  // Validate BEFORE clamping. `--from abc` parses to NaN, and NaN survives
  // Math.max/Math.min silently: the `from > to` check below is false for NaN,
  // so the season loop would simply never iterate and the command would exit 0
  // reporting "0 objects written" — a silent no-op that looks like success.
  for (const [flag, value] of [
    ['--from', args.from],
    ['--to', args.to],
  ] as const) {
    if (value !== undefined && !Number.isInteger(value)) {
      return {
        ok: false,
        error: `${flag} must be a whole year (got: ${value})`,
      };
    }
  }

  const currentSeason = currentNflSeason(now);
  const from = Math.max(args.from ?? FIRST_SEASON, FIRST_SEASON);
  const to = Math.min(args.to ?? currentSeason, currentSeason);

  if (from > to) {
    return {
      ok: false,
      error: `Empty season range: ${from} > ${to} (nflverse weekly stats cover ${FIRST_SEASON}-${currentSeason})`,
    };
  }
  return { ok: true, from, to };
}

function groupByPlayer(rows: NflverseRow[]): Map<string, NflverseRow[]> {
  const grouped = new Map<string, NflverseRow[]>();
  for (const row of rows) {
    if (row.season_type !== 'REG' || !row.player_id) continue;
    const bucket = grouped.get(row.player_id);
    if (bucket) bucket.push(row);
    else grouped.set(row.player_id, [row]);
  }
  return grouped;
}

async function objectExists(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function putGzippedJson(
  s3: S3Client,
  bucket: string,
  key: string,
  payload: unknown,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: gzipSync(Buffer.from(JSON.stringify(payload), 'utf-8')),
      ContentType: 'application/json',
      ContentEncoding: 'gzip',
    }),
  );
}

export async function handleIngestNflverseFootball(
  args: IngestNflverseFootballArgs,
): Promise<void> {
  const bucket = args.bucket ?? process.env.FOOTBALL_CORPUS_S3_BUCKET;
  if (!bucket && !args.dryRun) {
    LOGGER.error(
      'No bucket: pass --bucket or set FOOTBALL_CORPUS_S3_BUCKET (or use --dry-run)',
    );
    process.exit(1);
  }

  const prefix = args.prefix ?? process.env.FOOTBALL_CORPUS_S3_PREFIX ?? '';

  const range = resolveSeasonRange(args);
  // `in` narrowing: this project compiles without strictNullChecks, where a
  // boolean-literal discriminant (`!range.ok`) does not narrow the union.
  if ('error' in range) {
    LOGGER.error(range.error);
    process.exit(1);
  }
  const { from, to } = range;

  LOGGER.info(
    `nflverse football ingest: seasons ${from}-${to} -> s3://${bucket ?? '(dry-run)'}/${prefix} (force=${Boolean(args.force)}, dryRun=${Boolean(args.dryRun)}, payload v${NFLVERSE_PAYLOAD_VERSION})`,
  );
  LOGGER.info(
    'Data source: nflverse-data (CC-BY 4.0, https://github.com/nflverse/nflverse-data) — see docs/decisions/0022-football-per-game-stats-source.md',
  );

  LOGGER.info('Fetching pfr_id <-> gsis_id crosswalk and schedules...');
  const [playersCsv, schedulesCsv] = await Promise.all([
    fetchText(PLAYERS_URL),
    fetchText(SCHEDULES_URL),
  ]);
  const gsisToPfr = buildGsisToPfrCrosswalk(parseNflverseCsv(playersCsv));
  const scheduleRows = parseNflverseCsv(schedulesCsv);
  const gameIdIndex = buildGameIdIndex(scheduleRows);
  LOGGER.info(`Crosswalk ready: ${gsisToPfr.size} mappable players`);

  const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

  let totalPlayerObjects = 0;
  let totalTeamObjects = 0;
  let totalSkipped = 0;
  let totalUnmapped = 0;
  const failedSeasons: number[] = [];
  const currentSeason = currentNflSeason(new Date());

  for (let season = from; season <= to; season++) {
    let weeklyCsv: string | null;
    try {
      weeklyCsv = await fetchWeeklyStatsCsv(season);
    } catch (error) {
      LOGGER.error(`Season ${season}: download failed`, error as Error);
      failedSeasons.push(season);
      continue;
    }
    if (weeklyCsv === null) {
      // Only the in-progress season can simply be "not posted yet". A completed
      // season with no file means the URL is wrong or nflverse moved it, and
      // the corpus would silently lack that season (LS-10224).
      if (season >= currentSeason) {
        LOGGER.info(
          `Season ${season}: weekly stats not published yet, skipping`,
        );
      } else {
        LOGGER.error(
          `Season ${season}: no weekly stats file at ${weeklyStatsUrl(season)} (404)`,
        );
        failedSeasons.push(season);
      }
      continue;
    }

    const weeklyRows = parseNflverseCsv(weeklyCsv);
    const byPlayer = groupByPlayer(weeklyRows);

    let seasonPlayerObjects = 0;
    let seasonSkipped = 0;
    let seasonUnmapped = 0;

    for (const [gsisId, rows] of byPlayer) {
      const pfrId = gsisToPfr.get(gsisId);
      if (!pfrId) {
        seasonUnmapped++;
        continue;
      }

      const payload: NflversePlayerSeasonPayload = {
        v: NFLVERSE_PAYLOAD_VERSION,
        pfrId,
        gsisId,
        season,
        passing: buildPassingRows(rows, gameIdIndex, season),
        rushing: buildRushingRows(rows, gameIdIndex, season),
        receiving: buildReceivingRows(rows, gameIdIndex, season),
        kicking: buildKickingRows(rows, gameIdIndex, season),
        defenseIdp: buildDefenseIdpRows(rows, gameIdIndex, season),
      };

      const hasAnyRows =
        payload.passing.length > 0 ||
        payload.rushing.length > 0 ||
        payload.receiving.length > 0 ||
        payload.kicking.length > 0 ||
        payload.defenseIdp.length > 0;
      if (!hasAnyRows) continue;

      const key = buildPlayerObjectKey(prefix, pfrId, season);
      if (args.dryRun) {
        seasonPlayerObjects++;
        continue;
      }
      if (!args.force && (await objectExists(s3, bucket, key))) {
        seasonSkipped++;
        continue;
      }
      await putGzippedJson(s3, bucket, key, payload);
      seasonPlayerObjects++;
    }

    const teamDefenseGames = buildTeamDefenseGames(
      weeklyRows,
      scheduleRows,
      season,
    );
    let seasonTeamObjects = 0;
    for (const [nflTeam, games] of teamDefenseGames) {
      if (games.length === 0) continue;
      const key = buildTeamDefenseObjectKey(prefix, nflTeam, season);
      const payload = { v: NFLVERSE_PAYLOAD_VERSION, nflTeam, season, games };
      if (args.dryRun) {
        seasonTeamObjects++;
        continue;
      }
      if (!args.force && (await objectExists(s3, bucket, key))) {
        seasonSkipped++;
        continue;
      }
      await putGzippedJson(s3, bucket, key, payload);
      seasonTeamObjects++;
    }

    totalPlayerObjects += seasonPlayerObjects;
    totalTeamObjects += seasonTeamObjects;
    totalSkipped += seasonSkipped;
    totalUnmapped += seasonUnmapped;

    LOGGER.info(
      `Season ${season}: ${byPlayer.size} players in nflverse (${seasonUnmapped} unmapped), ` +
        `${seasonPlayerObjects} player object(s) written, ${seasonTeamObjects} team-defense object(s) written, ` +
        `${seasonSkipped} already present`,
    );
  }

  LOGGER.info(
    `Ingest complete: ${totalPlayerObjects} player objects, ${totalTeamObjects} team-defense objects, ` +
      `${totalSkipped} skipped (already present), ${totalUnmapped} distinct unmapped nflverse players (no pfr_id crosswalk)`,
  );

  assertNoFailedSeasons(failedSeasons);
}

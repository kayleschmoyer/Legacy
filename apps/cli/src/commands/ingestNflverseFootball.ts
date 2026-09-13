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
 * 1999-2025 game-level football stats (LS-9989). Mirrors
 * `apps/cli/src/commands/ingestRetrosheet.ts` (LS-9817) structurally; see
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
const weeklyStatsUrl = (season: number) =>
  `${NFLVERSE_RELEASE_BASE}/player_stats/stats_player_week_${season}.csv`;

/** nflverse's unified weekly stats file starts at 1999 (play-by-play does
 * not exist before that — the league's own digitization limit, ADR 0022). */
const FIRST_SEASON = 1999;
const LAST_SEASON = 2025;

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

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`);
  }
  return response.text();
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

  for (const [flag, value] of [
    ['--from', args.from],
    ['--to', args.to],
  ] as const) {
    if (value !== undefined && !Number.isInteger(value)) {
      LOGGER.error(`${flag} must be a whole year (got: ${value})`);
      process.exit(1);
    }
  }

  const from = Math.max(args.from ?? FIRST_SEASON, FIRST_SEASON);
  const to = Math.min(args.to ?? LAST_SEASON, LAST_SEASON);

  if (from > to) {
    LOGGER.error(
      `Empty season range: ${from} > ${to} (nflverse weekly stats cover ${FIRST_SEASON}-${LAST_SEASON})`,
    );
    process.exit(1);
  }

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

  for (let season = from; season <= to; season++) {
    let weeklyCsv: string;
    try {
      weeklyCsv = await fetchText(weeklyStatsUrl(season));
    } catch (error) {
      LOGGER.error(`Season ${season}: download failed`, error as Error);
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
}

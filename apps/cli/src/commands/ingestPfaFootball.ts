import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  accumulateBoxScore,
  accumulatedPlayerSeasons,
  accumulateKickerGameLog,
  BoxScoreParser,
  buildPfaObjectKey,
  buildSeasonIndexUrl,
  crawlPlayerIndex,
  createAccumulator,
  fetchFootballPlayerCandidates,
  KickerGameLogParser,
  parseSeasonIndexPage,
  PFA_BASE_URL,
  PFA_PAYLOAD_VERSION,
  PFA_USER_AGENT,
  type PfaIngestAccumulator,
  type PfaPlayerSeasonPayload,
  PfaRateLimiter,
  resolvePfaCrosswalk,
} from '@legacy-sports/pfa-client';
import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import { eq } from 'drizzle-orm';
import { gzipSync } from 'node:zlib';

/**
 * Stage the Pro Football Archives corpus (1960-1998) in S3, one object per
 * (pfrId, season) — the pre-nflverse sibling of
 * `apps/cli/src/commands/ingestNflverseFootball.ts` (LS-9989), which itself
 * mirrors `ingestRetrosheet.ts` (LS-9817). Implements LS-9995. See
 * `terraform/main/football-corpus.tf` for the bucket this writes to
 * (the `pfa/` prefix, alongside `ingestNflverseFootball.ts`'s `nflverse/`
 * prefix) and LS-9948 for the parent slice this closes out.
 *
 * Unlike the nflverse/Retrosheet ingests, PFA is a live crawled site with no
 * stated rate limit (not a static archive), so every request goes through
 * `PfaRateLimiter` — never fetched unthrottled.
 *
 * Scope note: only the `nfl` league is crawled. PFA also separately indexes
 * `afl`/`aafc` box scores for 1960-1969/1946-1949, but LS-9995's acceptance
 * criteria target the NFL's own 1960-1998 range; AFL/AAFC box-score
 * ingestion is a documented extension point, not attempted here (the
 * crosswalk resolver's era-window logic already accounts for AFL/AAFC
 * player eras when matching NFL-side appearances).
 */

const FIRST_SEASON = 1960;
const LAST_SEASON = 1998;
const FETCH_TIMEOUT_MS = 30_000;

export interface IngestPfaFootballArgs {
  bucket?: string;
  prefix?: string;
  from?: number;
  to?: number;
  /** Re-upload objects that already exist (default: skip them). */
  force?: boolean;
  /** Crawl and report without writing to S3. */
  dryRun?: boolean;
}

async function fetchPfaPage(
  url: string,
  rateLimiter: PfaRateLimiter,
): Promise<string | null> {
  await rateLimiter.waitForTurn();
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': PFA_USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      LOGGER.warn(`PFA ingest: ${url} returned HTTP ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (error) {
    LOGGER.warn(`PFA ingest: ${url} failed`, {
      error: error instanceof Error ? error : String(error),
    });
    return null;
  }
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

/** playerId -> pfrId, for football players that carry one (an unset pfrId
 * means the player can never be a write target here — the S3 key requires
 * it). Fetched separately from `fetchFootballPlayerCandidates` since the
 * crosswalk resolver's candidate shape (LS-9993) doesn't carry pfrId. */
async function fetchPfrIdByPlayerId(
  db: Parameters<typeof fetchFootballPlayerCandidates>[0],
): Promise<Map<number, string>> {
  const rows = await db
    .select({ id: PublicSchema.players.id, pfrId: PublicSchema.players.pfrId })
    .from(PublicSchema.players)
    .where(eq(PublicSchema.players.sport, 'football'));

  const map = new Map<number, string>();
  for (const row of rows) {
    if (row.pfrId) map.set(row.id, row.pfrId);
  }
  return map;
}

interface ResolvedPfaIdentity {
  playerId: number;
  pfrId: string;
}

async function buildResolvedCrosswalk(
  rateLimiter: PfaRateLimiter,
): Promise<Map<string, ResolvedPfaIdentity>> {
  LOGGER.info('PFA ingest: crawling player index (78 pages) for crosswalk...');
  const sourceTable = await crawlPlayerIndex({ rateLimiter });
  if (sourceTable.errors.length > 0) {
    LOGGER.warn(
      `PFA ingest: player-index crawl had ${sourceTable.errors.length} page error(s)`,
      { errors: sourceTable.errors },
    );
  }

  const resolved = await runWithPublicClient(getDbOptions(), async (db) => {
    const [candidates, pfrIdByPlayerId] = await Promise.all([
      fetchFootballPlayerCandidates(db),
      fetchPfrIdByPlayerId(db),
    ]);
    const crosswalkRows = resolvePfaCrosswalk(sourceTable.entries, candidates);

    const map = new Map<string, ResolvedPfaIdentity>();
    let unresolved = 0;
    let noPfrId = 0;
    for (const row of crosswalkRows) {
      if (row.playerId === null) {
        unresolved++;
        continue;
      }
      const pfrId = pfrIdByPlayerId.get(row.playerId);
      if (!pfrId) {
        noPfrId++;
        continue;
      }
      map.set(row.pfaId, { playerId: row.playerId, pfrId });
    }
    LOGGER.info(
      `PFA ingest: crosswalk resolved ${map.size}/${crosswalkRows.length} PFA entries ` +
        `(${unresolved} unmatched, ${noPfrId} matched but missing players.pfr_id)`,
    );
    return map;
  });

  return resolved;
}

async function crawlSeasonBoxScores(
  season: number,
  rateLimiter: PfaRateLimiter,
  acc: PfaIngestAccumulator,
  kickerCandidates: Set<string>,
): Promise<{ games: number; postseasonSkipped: number }> {
  const indexUrl = buildSeasonIndexUrl(season);
  const indexHtml = await fetchPfaPage(indexUrl, rateLimiter);
  if (!indexHtml) return { games: 0, postseasonSkipped: 0 };

  const refs = parseSeasonIndexPage(indexHtml, season);
  const regularSeasonRefs = refs.filter((ref) => !ref.postseason);
  const postseasonSkipped = refs.length - regularSeasonRefs.length;

  let games = 0;
  for (const ref of regularSeasonRefs) {
    const html = await fetchPfaPage(ref.url, rateLimiter);
    if (!html) continue;

    try {
      const boxScore = BoxScoreParser.parseBoxScore(html, ref.url);
      accumulateBoxScore(acc, boxScore);
      games++;
    } catch (error) {
      LOGGER.warn(`PFA ingest: failed to parse box score ${ref.url}`, {
        error: error instanceof Error ? error : String(error),
      });
      continue;
    }

    for (const pfaId of BoxScoreParser.extractKickerCandidates(html)) {
      kickerCandidates.add(pfaId);
    }
  }

  return { games, postseasonSkipped };
}

async function crawlKickerGameLogs(
  kickerCandidates: Set<string>,
  resolved: Map<string, ResolvedPfaIdentity>,
  rateLimiter: PfaRateLimiter,
  acc: PfaIngestAccumulator,
  from: number,
  to: number,
): Promise<void> {
  const resolvedKickers = Array.from(kickerCandidates).filter((pfaId) =>
    resolved.has(pfaId),
  );
  LOGGER.info(
    `PFA ingest: crawling ${resolvedKickers.length} kicker game log(s) ` +
      `(${kickerCandidates.size - resolvedKickers.length} unresolved kicker(s) skipped)`,
  );

  for (const pfaId of resolvedKickers) {
    // /gamelogs/<letter>/<pfaId>.html — first letter of the pfaId, which is
    // itself a surname-derived code (e.g. "sten00200" -> "s").
    const letter = pfaId[0];
    const url = `${PFA_BASE_URL}/gamelogs/${letter}/${pfaId}.html`;
    const html = await fetchPfaPage(url, rateLimiter);
    if (!html) continue;

    const rows = KickerGameLogParser.parseKickerGameLog(html);
    accumulateKickerGameLog(
      acc,
      pfaId,
      rows,
      (season) => season >= from && season <= to,
    );
  }
}

export async function handleIngestPfaFootball(
  args: IngestPfaFootballArgs,
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
      `Empty season range: ${from} > ${to} (PFA NFL coverage for this ingest is ${FIRST_SEASON}-${LAST_SEASON})`,
    );
    process.exit(1);
  }

  LOGGER.info(
    `PFA football ingest: seasons ${from}-${to} -> s3://${bucket ?? '(dry-run)'}/${prefix} ` +
      `(force=${Boolean(args.force)}, dryRun=${Boolean(args.dryRun)}, payload v${PFA_PAYLOAD_VERSION})`,
  );

  const rateLimiter = new PfaRateLimiter();
  const resolved = await buildResolvedCrosswalk(rateLimiter);

  const acc = createAccumulator();
  const kickerCandidates = new Set<string>();
  let totalGames = 0;
  let totalPostseasonSkipped = 0;

  for (let season = from; season <= to; season++) {
    const { games, postseasonSkipped } = await crawlSeasonBoxScores(
      season,
      rateLimiter,
      acc,
      kickerCandidates,
    );
    totalGames += games;
    totalPostseasonSkipped += postseasonSkipped;
    LOGGER.info(
      `Season ${season}: ${games} regular-season box score(s) parsed ` +
        `(${postseasonSkipped} postseason game(s) skipped)`,
    );
  }

  await crawlKickerGameLogs(
    kickerCandidates,
    resolved,
    rateLimiter,
    acc,
    from,
    to,
  );

  const playerSeasons = accumulatedPlayerSeasons(acc);
  const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

  let written = 0;
  let skippedExisting = 0;
  let unresolved = 0;

  for (const { pfaId, season } of playerSeasons) {
    const identity = resolved.get(pfaId);
    if (!identity) {
      unresolved++;
      continue;
    }

    const payload: PfaPlayerSeasonPayload = {
      v: PFA_PAYLOAD_VERSION,
      pfrId: identity.pfrId,
      pfaId,
      season,
      passing: acc.passing.get(pfaId)?.get(season) ?? [],
      rushing: acc.rushing.get(pfaId)?.get(season) ?? [],
      receiving: acc.receiving.get(pfaId)?.get(season) ?? [],
      kicking: acc.kicking.get(pfaId)?.get(season) ?? [],
    };

    const key = buildPfaObjectKey(prefix, identity.pfrId, season);
    if (args.dryRun) {
      written++;
      continue;
    }
    if (!args.force && (await objectExists(s3, bucket, key))) {
      skippedExisting++;
      continue;
    }
    await putGzippedJson(s3, bucket, key, payload);
    written++;
  }

  LOGGER.info(
    `Ingest complete: ${totalGames} box score(s) parsed (${totalPostseasonSkipped} postseason skipped), ` +
      `${written} player-season object(s) ${args.dryRun ? 'would be written (dry run)' : 'written'}, ` +
      `${skippedExisting} skipped (already present), ` +
      `${unresolved} player-season(s) dropped (no crosswalk match)`,
  );
}

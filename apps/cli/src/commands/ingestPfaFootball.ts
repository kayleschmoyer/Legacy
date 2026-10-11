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
  type PfaCrosswalkRow,
  type PfaIngestAccumulator,
  type PfaPlayerSeasonPayload,
  PfaRateLimiter,
  resolvePfaCrosswalk,
} from '@legacy-sports/pfa-client';
import {
  type FootballCorpusIdentity,
  resolveFootballCorpusKey,
} from '@legacy-sports/football-game-stats-provider';
import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import { eq } from 'drizzle-orm';
import { gzipSync } from 'node:zlib';

/**
 * Stage the Pro Football Archives corpus (1960-1998) in S3, one object per
 * (corpus key, season) — the corpus key is `pfr_id`, or `pfa-<pfa_id>` for a
 * player with no PFR id (ADR 0023, LS-10588) — the pre-nflverse sibling of
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

export const FIRST_SEASON = 1960;
export const LAST_SEASON = 1998;
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

export async function fetchPfaPage(
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

/** playerId -> identity columns for every football player. The corpus key
 * (`pfr_id ?? 'pfa-' || pfa_id`) is resolved from these; a player with
 * neither can never be a write target here. Fetched separately from
 * `fetchFootballPlayerCandidates` since the crosswalk resolver's candidate
 * shape (LS-9993) doesn't carry them. */
async function fetchFootballIdentities(
  db: Parameters<typeof fetchFootballPlayerCandidates>[0],
): Promise<Map<number, FootballCorpusIdentity>> {
  const rows = await db
    .select({
      id: PublicSchema.players.id,
      pfrId: PublicSchema.players.pfrId,
      pfaId: PublicSchema.players.pfaId,
    })
    .from(PublicSchema.players)
    .where(eq(PublicSchema.players.sport, 'football'));

  return new Map(
    rows.map((row) => [row.id, { pfrId: row.pfrId, pfaId: row.pfaId }]),
  );
}

export interface ResolvedPfaIdentity {
  playerId: number;
  /** Null for a PFA-only player (ADR 0023); the payload then carries no PFR id. */
  pfrId: string | null;
  corpusKey: string;
}

export interface PfaIngestResolution {
  resolved: Map<string, ResolvedPfaIdentity>;
  unresolved: number;
  /** Name-matched a row that already belongs to a different PFA id. */
  pfaIdConflict: number;
  /** Matched a row with neither pfr_id nor pfa_id, so there is no corpus key. */
  noCorpusKey: number;
}

/**
 * Maps each PFA id to the `players` row whose corpus key the ingest writes
 * under. A row that already carries this exact `pfa_id` (seeded by
 * `seed-pfa-football-players`) wins outright, before any name matching. A
 * name match onto a row that carries a *different* `pfa_id` is rejected:
 * that row is another PFA player's identity. Pure, so it is unit tested.
 */
export function resolvePfaIngestIdentities(
  crosswalkRows: readonly PfaCrosswalkRow[],
  identities: ReadonlyMap<number, FootballCorpusIdentity>,
): PfaIngestResolution {
  const playerIdByPfaId = new Map<string, number>();
  for (const [playerId, identity] of identities) {
    if (identity.pfaId) playerIdByPfaId.set(identity.pfaId, playerId);
  }

  const resolved = new Map<string, ResolvedPfaIdentity>();
  let unresolved = 0;
  let pfaIdConflict = 0;
  let noCorpusKey = 0;
  for (const row of crosswalkRows) {
    const playerId = playerIdByPfaId.get(row.pfaId) ?? row.playerId;
    if (playerId === null) {
      unresolved++;
      continue;
    }
    const identity = identities.get(playerId);
    if (identity?.pfaId && identity.pfaId !== row.pfaId) {
      pfaIdConflict++;
      continue;
    }
    const corpusKey = identity ? resolveFootballCorpusKey(identity) : null;
    if (!identity || corpusKey === null) {
      noCorpusKey++;
      continue;
    }
    resolved.set(row.pfaId, {
      playerId,
      pfrId: identity.pfrId,
      corpusKey,
    });
  }
  return { resolved, unresolved, pfaIdConflict, noCorpusKey };
}

interface CrosswalkInputs {
  entries: Awaited<ReturnType<typeof crawlPlayerIndex>>['entries'];
  candidates: Awaited<ReturnType<typeof fetchFootballPlayerCandidates>>;
  identities: Map<number, FootballCorpusIdentity>;
}

/** Crawls the PFA player index and reads `players` up front, before the
 * hours-long box-score crawl, so an unreachable index or DB fails fast. */
async function loadCrosswalkInputs(
  rateLimiter: PfaRateLimiter,
): Promise<CrosswalkInputs> {
  LOGGER.info('PFA ingest: crawling player index for crosswalk...');
  const sourceTable = await crawlPlayerIndex({ rateLimiter });
  if (sourceTable.errors.length > 0) {
    LOGGER.warn(
      `PFA ingest: player-index crawl had ${sourceTable.errors.length} page error(s)`,
      { errors: sourceTable.errors },
    );
  }

  const [candidates, identities] = await runWithPublicClient(
    getDbOptions(),
    (db) =>
      Promise.all([
        fetchFootballPlayerCandidates(db),
        fetchFootballIdentities(db),
      ]),
  );
  return { entries: sourceTable.entries, candidates, identities };
}

/** pfaId -> every season it appeared in: a stat line in a box score, or a
 * kick credited in a box score's scoring plays. */
export function collectObservedSeasons(
  acc: PfaIngestAccumulator,
  kickersBySeason: ReadonlyMap<number, ReadonlySet<string>>,
): Map<string, Set<number>> {
  const observed = new Map<string, Set<number>>();
  const add = (pfaId: string, season: number) => {
    let seasons = observed.get(pfaId);
    if (!seasons) {
      seasons = new Set();
      observed.set(pfaId, seasons);
    }
    seasons.add(season);
  };
  for (const { pfaId, season } of accumulatedPlayerSeasons(acc)) {
    add(pfaId, season);
  }
  for (const [season, kickers] of kickersBySeason) {
    for (const pfaId of kickers) add(pfaId, season);
  }
  return observed;
}

function resolveCrosswalk(
  inputs: CrosswalkInputs,
  observedSeasons: ReadonlyMap<string, ReadonlySet<number>>,
): Map<string, ResolvedPfaIdentity> {
  const crosswalkRows = resolvePfaCrosswalk(
    inputs.entries,
    inputs.candidates,
    observedSeasons,
  );
  const resolution = resolvePfaIngestIdentities(
    crosswalkRows,
    inputs.identities,
  );
  const seasonMatched = crosswalkRows.filter(
    (row) => row.matchMethod === 'name_season_disambiguated',
  ).length;

  LOGGER.info(
    `PFA ingest: crosswalk resolved ${resolution.resolved.size}/${crosswalkRows.length} PFA entries ` +
      `(${resolution.unresolved} unmatched, ${resolution.pfaIdConflict} matched a row owned by another pfa_id, ` +
      `${resolution.noCorpusKey} matched but missing both players.pfr_id and players.pfa_id; ` +
      `${seasonMatched} same-name match(es) settled by box-score seasons)`,
  );
  return resolution.resolved;
}

export async function crawlSeasonBoxScores(
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
  kickerCandidates: ReadonlySet<string>,
  resolved: Map<string, ResolvedPfaIdentity>,
  rateLimiter: PfaRateLimiter,
  acc: PfaIngestAccumulator,
  from: number,
  to: number,
): Promise<void> {
  const resolvedKickers = Array.from(kickerCandidates).filter((pfaId) =>
    resolved.has(pfaId),
  );
  const unresolvedKickers = Array.from(kickerCandidates)
    .filter((pfaId) => !resolved.has(pfaId))
    .sort();
  LOGGER.info(
    `PFA ingest: crawling ${resolvedKickers.length} kicker game log(s) ` +
      `(${unresolvedKickers.length} unresolved kicker(s) skipped` +
      (unresolvedKickers.length > 0
        ? `: ${unresolvedKickers.join(', ')}`
        : '') +
      ')',
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
  const crosswalkInputs = await loadCrosswalkInputs(rateLimiter);

  const acc = createAccumulator();
  const kickersBySeason = new Map<number, Set<string>>();
  let totalGames = 0;
  let totalPostseasonSkipped = 0;

  for (let season = from; season <= to; season++) {
    const kickers = new Set<string>();
    const { games, postseasonSkipped } = await crawlSeasonBoxScores(
      season,
      rateLimiter,
      acc,
      kickers,
    );
    kickersBySeason.set(season, kickers);
    totalGames += games;
    totalPostseasonSkipped += postseasonSkipped;
    LOGGER.info(
      `Season ${season}: ${games} regular-season box score(s) parsed ` +
        `(${postseasonSkipped} postseason game(s) skipped)`,
    );
  }

  // Resolved after the box-score crawl, not before: the seasons each PFA id
  // appeared in are what tell same-name players apart (LS-11064).
  const resolved = resolveCrosswalk(
    crosswalkInputs,
    collectObservedSeasons(acc, kickersBySeason),
  );
  const kickerCandidates = new Set<string>();
  for (const kickers of kickersBySeason.values()) {
    for (const pfaId of kickers) kickerCandidates.add(pfaId);
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

    const key = buildPfaObjectKey(prefix, identity.corpusKey, season);
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

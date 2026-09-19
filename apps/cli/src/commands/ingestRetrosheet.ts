import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  aggregateFielding,
  assignGameNumbers,
  buildObjectKey,
  type CsvRow,
  isValueRow,
  readZipEntryText,
  RETROSHEET_PAYLOAD_VERSION,
  type RetrosheetSeasonPayload,
  toStoredBatting,
  toStoredPitching,
} from '@legacy-sports/game-stats-provider';
import { LOGGER } from '@legacy-sports/logging';
import { gzipSync } from 'node:zlib';

/**
 * Stage the Retrosheet corpus in S3, one object per (brefId, season).
 *
 * Replaces per-player Baseball Reference scraping as the bulk source for
 * game-level baseball stats (LS-9817). The scraper is capped at 15 req/min
 * GLOBALLY, so warming the ~90k cold player-seasons that way would take
 * ~300 hours; Retrosheet is static files, so the same corpus lands in minutes.
 *
 * Retrosheet's processed CSVs start in 1897 and gain one season per year, each
 * published the winter after it ends. Pre-1897 player-seasons are not
 * available here and remain on the scraper fallback. The annual refresh is
 * documented in .agents/skills/dev-environment/references/cli-commands.md.
 *
 * Data source and attribution:
 *   The information used here was obtained free of charge from and is
 *   copyrighted by Retrosheet. Interested parties may contact Retrosheet at
 *   "www.retrosheet.org".
 */

const RETROSHEET_SEASON_URL =
  'https://www.retrosheet.org/downloads/{year}/{year}csvs.zip';
const CHADWICK_SHARD_URL =
  'https://raw.githubusercontent.com/chadwickbureau/register/master/data/people-{shard}.csv';
const CHADWICK_SHARDS = '0123456789abcdef'.split('');

/** First season in Retrosheet's processed CSV coverage. */
export const FIRST_SEASON = 1897;

const USER_AGENT = 'legacy-sports-retrosheet-ingest/1.0';

export interface IngestRetrosheetArgs {
  bucket?: string;
  prefix?: string;
  from?: number;
  to?: number;
  /** Re-upload objects that already exist (default: skip them). */
  force?: boolean;
  /** Parse and report without writing to S3. */
  dryRun?: boolean;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/**
 * Bounded fetch. The ingest walks 129 season archives plus 16 crosswalk shards
 * sequentially against third-party hosts; without a timeout a single stalled
 * connection hangs the whole run with no output.
 */
const FETCH_TIMEOUT_MS = 120_000;

class HttpStatusError extends Error {
  constructor(
    url: string,
    readonly status: number,
  ) {
    super(`GET ${url} failed: ${status}`);
  }
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new HttpStatusError(url, response.status);
  }
  return Buffer.from(await response.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Season range
// ---------------------------------------------------------------------------

export type SeasonRange =
  | { ok: true; from: number; to: number }
  | { ok: false; error: string };

/**
 * Resolve --from/--to against the current date (LS-10232).
 *
 * Retrosheet publishes season Y the winter after it ends, so the default upper
 * bound is last year. An explicit --to may reach the current season; if its
 * archive is not published yet, the season loop skips it with a warning.
 * Future seasons cannot exist and are clamped away.
 */
export function resolveSeasonRange(
  args: Pick<IngestRetrosheetArgs, 'from' | 'to'>,
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

  const currentSeason = now.getUTCFullYear();
  const from = Math.max(args.from ?? FIRST_SEASON, FIRST_SEASON);
  const to = Math.min(args.to ?? currentSeason - 1, currentSeason);

  if (from > to) {
    return {
      ok: false,
      error: `Empty season range: ${from} > ${to} (Retrosheet covers ${FIRST_SEASON}-${currentSeason - 1}, plus ${currentSeason} once published)`,
    };
  }
  return { ok: true, from, to };
}

/**
 * Minimal CSV reader.
 *
 * Retrosheet's processed CSVs are machine-generated and contain no embedded
 * newlines, but fields ARE sometimes quoted (player names with commas), so
 * quote handling is required.
 */
function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
    out.push(field);
    return out;
  };

  const header = splitLine(lines[0]);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const row: CsvRow = {};
    for (let c = 0; c < header.length; c++) {
      row[header[c]] = cells[c] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Crosswalk
// ---------------------------------------------------------------------------

/**
 * Build retro_id -> bref_id from the Chadwick Bureau Register.
 *
 * Objects are keyed by bref_id so the read path (which only has
 * `player.brefId`) needs no crosswalk at runtime. Measured coverage against
 * this app's real player set is ~99%; the residual is malformed placeholder
 * ids with no stats (LS-9809).
 */
async function buildRetroToBref(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const shard of CHADWICK_SHARDS) {
    const url = CHADWICK_SHARD_URL.replace('{shard}', shard);
    const text = (await fetchBuffer(url)).toString('utf-8');
    for (const row of parseCsv(text)) {
      const bref = (row['key_bbref'] ?? '').trim();
      const retro = (row['key_retro'] ?? '').trim();
      if (bref && retro) {
        map.set(retro, bref);
      }
    }
    LOGGER.info(`Chadwick shard ${shard}: crosswalk now ${map.size} entries`);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Season processing
// ---------------------------------------------------------------------------

function groupByPlayer(rows: CsvRow[]): Map<string, CsvRow[]> {
  const grouped = new Map<string, CsvRow[]>();
  for (const row of rows) {
    if (!isValueRow(row)) {
      continue;
    }
    const id = row['id'];
    if (!id) {
      continue;
    }
    const bucket = grouped.get(id);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(id, [row]);
    }
  }
  return grouped;
}

function buildPayloads(
  season: number,
  batting: CsvRow[],
  pitching: CsvRow[],
  fielding: CsvRow[],
  retroToBref: Map<string, string>,
): { payloads: RetrosheetSeasonPayload[]; unmapped: Set<string> } {
  const byPlayer = new Map<
    string,
    { batting: CsvRow[]; pitching: CsvRow[]; fielding: CsvRow[] }
  >();

  const ensure = (id: string) => {
    let entry = byPlayer.get(id);
    if (!entry) {
      entry = { batting: [], pitching: [], fielding: [] };
      byPlayer.set(id, entry);
    }
    return entry;
  };

  for (const [id, rows] of groupByPlayer(batting)) ensure(id).batting = rows;
  for (const [id, rows] of groupByPlayer(pitching)) ensure(id).pitching = rows;
  for (const [id, rows] of groupByPlayer(fielding)) ensure(id).fielding = rows;

  const payloads: RetrosheetSeasonPayload[] = [];
  const unmapped = new Set<string>();

  for (const [retroId, groups] of byPlayer) {
    const brefId = retroToBref.get(retroId);
    if (!brefId) {
      unmapped.add(retroId);
      continue;
    }

    // game_number is a per-player-season sequence over every game the player
    // appeared in, in any capacity — so derive it from the union of all three
    // stat families rather than per-family, keeping the three tables' game
    // numbering consistent for the same player-season.
    const allRows = [...groups.batting, ...groups.pitching, ...groups.fielding];
    const gameNumbers = assignGameNumbers(allRows);
    const numberFor = (gid: string) => gameNumbers.get(gid) ?? 0;

    // Retrosheet emits one fielding row per position per game; the target
    // table is one row per player-game, so collapse by game first.
    const fieldingByGame = new Map<string, CsvRow[]>();
    for (const row of groups.fielding) {
      const gid = row['gid'];
      const bucket = fieldingByGame.get(gid);
      if (bucket) {
        bucket.push(row);
      } else {
        fieldingByGame.set(gid, [row]);
      }
    }

    payloads.push({
      v: RETROSHEET_PAYLOAD_VERSION,
      brefId,
      retroId,
      season,
      batting: groups.batting.map((row) =>
        toStoredBatting(row, season, numberFor(row['gid'])),
      ),
      pitching: groups.pitching.map((row) =>
        toStoredPitching(row, season, numberFor(row['gid'])),
      ),
      fielding: [...fieldingByGame.values()].map((rows) =>
        aggregateFielding(rows, season, numberFor(rows[0]['gid'])),
      ),
    });
  }

  return { payloads, unmapped };
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

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function handleIngestRetrosheet(
  args: IngestRetrosheetArgs,
): Promise<void> {
  const bucket = args.bucket ?? process.env.RETROSHEET_S3_BUCKET;
  if (!bucket && !args.dryRun) {
    LOGGER.error(
      'No bucket: pass --bucket or set RETROSHEET_S3_BUCKET (or use --dry-run)',
    );
    process.exit(1);
  }

  const prefix = args.prefix ?? process.env.RETROSHEET_S3_PREFIX ?? '';

  const range = resolveSeasonRange(args);
  // `in` narrowing: this project compiles without strictNullChecks, where a
  // boolean-literal discriminant (`!range.ok`) does not narrow the union.
  if ('error' in range) {
    LOGGER.error(range.error);
    process.exit(1);
  }
  const { from, to } = range;

  LOGGER.info(
    `Retrosheet ingest: seasons ${from}-${to} -> s3://${bucket ?? '(dry-run)'}/${prefix} (force=${Boolean(args.force)}, dryRun=${Boolean(args.dryRun)})`,
  );

  LOGGER.info('Building Chadwick bref<->retro crosswalk...');
  const retroToBref = await buildRetroToBref();
  LOGGER.info(`Crosswalk ready: ${retroToBref.size} mappable players`);

  const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

  let totalUploaded = 0;
  let totalSkipped = 0;
  const allUnmapped = new Set<string>();

  for (let season = from; season <= to; season++) {
    const url = RETROSHEET_SEASON_URL.replace(/\{year\}/g, String(season));
    let archive: Buffer;
    try {
      archive = await fetchBuffer(url);
    } catch (error) {
      // Retrosheet publishes a season the winter after it ends; until then the
      // archive 404s. That is expected, not a failure.
      if (error instanceof HttpStatusError && error.status === 404) {
        LOGGER.warn(
          `Season ${season}: archive not published yet (404 at ${url}), skipping`,
          error,
        );
        continue;
      }
      LOGGER.error(`Season ${season}: download failed`, error as Error);
      continue;
    }

    const read = (name: string): CsvRow[] => {
      const text = readZipEntryText(archive, name);
      if (text === null) {
        LOGGER.warn(`Season ${season}: missing member ${name}`);
        return [];
      }
      return parseCsv(text);
    };

    // Only the three stat members are read. plays.csv is ~87% of the archive's
    // uncompressed bytes and is never decompressed, which keeps the working
    // set per season around 16 MiB instead of 126 MiB.
    const { payloads, unmapped } = buildPayloads(
      season,
      read(`${season}batting.csv`),
      read(`${season}pitching.csv`),
      read(`${season}fielding.csv`),
      retroToBref,
    );
    unmapped.forEach((id) => allUnmapped.add(id));

    let uploaded = 0;
    let skipped = 0;
    for (const payload of payloads) {
      const key = buildObjectKey(prefix, payload.brefId, season);
      if (args.dryRun) {
        uploaded++;
        continue;
      }
      if (!args.force && (await objectExists(s3, bucket, key))) {
        skipped++;
        continue;
      }
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: gzipSync(Buffer.from(JSON.stringify(payload), 'utf-8')),
          ContentType: 'application/json',
          ContentEncoding: 'gzip',
        }),
      );
      uploaded++;
    }

    totalUploaded += uploaded;
    totalSkipped += skipped;
    LOGGER.info(
      `Season ${season}: ${payloads.length} player-seasons (${uploaded} written, ${skipped} already present, ${unmapped.size} unmapped)`,
    );
  }

  LOGGER.info(
    `Ingest complete: ${totalUploaded} objects written, ${totalSkipped} skipped, ${allUnmapped.size} distinct unmapped Retrosheet ids`,
  );
  if (allUnmapped.size > 0) {
    LOGGER.warn(`Unmapped sample: ${[...allUnmapped].slice(0, 20).join(', ')}`);
  }
}

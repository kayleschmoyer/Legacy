import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import {
  PublicDb,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { and, eq, like, sql } from 'drizzle-orm';
import { SendMessageBatchCommand, SQSClient } from '@aws-sdk/client-sqs';
import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import {
  getPlayersByLetter,
  type IdpPosition,
  mapPfrPosition,
} from '@legacy-sports/pfr-client';
import { InvalidArgumentError } from 'commander';
import { EnvironmentVariable } from '../EnvironmentVariable';

export type Sport = 'baseball' | 'football';

// SQS SendMessageBatch accepts at most 10 entries per call.
const SQS_BATCH_SIZE = 10;
const REGION = process.env.AWS_REGION || 'us-east-1';
const ALL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Maps PFR 2-3 char team codes to our nfl_teams.abbreviation values.
// Relocated/defunct franchises map to null (FK set to null, not a violation).
const PFR_TEAM_MAP: Record<string, string | null> = {
  GNB: 'GB',
  NWE: 'NE',
  KAN: 'KC',
  NOR: 'NO',
  TAM: 'TB',
  SFO: 'SF',
  LVR: 'LV',
  JAC: 'JAX',
  ARZ: 'ARI',
  // Relocated — no longer active franchises in nfl_teams
  OAK: null, // → Las Vegas Raiders
  STL: null, // → Los Angeles Rams
  SDG: null, // → Los Angeles Chargers
  RAM: null, // old Rams abbreviation
  HTX: null, // old Texans abbreviation
  CLV: null, // old Browns abbreviation (pre-1996)
  PHO: null, // Phoenix Cardinals
  BOS: null, // Boston Patriots
};

export interface SqsBatchEntry {
  Id: string;
  MessageBody: string;
  MessageGroupId: string;
  MessageDeduplicationId: string;
}

export interface HandleQueuePlayersArgs {
  sport: Sport;
  letter?: string;
  skipQueue?: boolean;
}

interface EligibleFootballPlayer {
  pfrId: string;
  position: Exclude<IdpPosition, null>;
}

/**
 * Commander option coercer for --sport. Throws InvalidArgumentError on any
 * value other than the two supported sport discriminators so the CLI prints a
 * clean usage error instead of failing deep inside the handler.
 */
export function parseSport(value: string): Sport {
  if (value === 'baseball' || value === 'football') {
    return value;
  }
  throw new InvalidArgumentError(
    `--sport must be 'baseball' or 'football', got '${value}'`,
  );
}

/** Split a flat list into SQS-sized batches. */
export function chunkIntoBatches<T>(
  items: T[],
  size: number = SQS_BATCH_SIZE,
): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * Build SQS entries for a single baseball batch. The message body is the raw
 * bref_id string (the baseball stats lambda's expected payload).
 */
export function buildBaseballBatchEntries(
  batch: string[],
  batchIdx: number,
  timestamp: number,
): SqsBatchEntry[] {
  return batch.map((brefId, idx) => ({
    Id: `${batchIdx}-${idx}`,
    MessageBody: JSON.stringify(brefId),
    MessageGroupId: `batch-${batchIdx}`,
    MessageDeduplicationId: `${brefId}-${timestamp}-${batchIdx}-${idx}`,
  }));
}

/**
 * Build SQS entries for a single football batch. The message body carries the
 * pfrId + normalized position (the football stats lambda's expected payload).
 */
export function buildFootballBatchEntries(
  batch: EligibleFootballPlayer[],
  batchIdx: number,
  timestamp: number,
): SqsBatchEntry[] {
  return batch.map((player, idx) => ({
    Id: `${batchIdx}-${idx}`,
    MessageBody: JSON.stringify({
      pfrId: player.pfrId,
      position: player.position,
    }),
    MessageGroupId: `letter-${player.pfrId[0].toUpperCase()}`,
    MessageDeduplicationId: `${player.pfrId}-${timestamp}-${batchIdx}-${idx}`,
  }));
}

/** Send pre-built batches to SQS, one SendMessageBatch call per batch. */
export async function dispatchBatches(
  sqs: SQSClient,
  queueUrl: string,
  batches: SqsBatchEntry[][],
): Promise<void> {
  const total = batches.reduce((sum, batch) => sum + batch.length, 0);
  LOGGER.info(`Queuing ${total} players in ${batches.length} SQS batch(es)...`);

  for (let i = 0; i < batches.length; i++) {
    await sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: batches[i],
      }),
    );
    if ((i + 1) % 100 === 0) {
      LOGGER.info(`Queued ${(i + 1) * SQS_BATCH_SIZE} / ${total} players...`);
    }
  }
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    return { firstName: trimmed, lastName: trimmed };
  }
  return {
    firstName: trimmed.slice(0, spaceIdx),
    lastName: trimmed.slice(spaceIdx + 1),
  };
}

function mapTeam(pfrTeam: string | null): string | null {
  if (!pfrTeam) return null;
  if (pfrTeam in PFR_TEAM_MAP) return PFR_TEAM_MAP[pfrTeam];
  // Pass through as-is for abbreviations that match our nfl_teams table.
  return pfrTeam;
}

export async function upsertFootballPlayer(
  db: PublicDb,
  params: {
    firstName: string;
    lastName: string;
    pfrId: string;
    nflTeam: string | null;
    position: Exclude<IdpPosition, null>;
  },
): Promise<void> {
  // bref_id is NOT NULL in the schema; football players use pfr_id as the
  // bref_id value. ON CONFLICT uses the partial unique index on pfr_id
  // (WHERE pfr_id IS NOT NULL). `position` is the player_position enum — the
  // already-normalized mapPfrPosition output (DL/LB/DB/QB/RB/WR/TE/K), all of
  // which are enum members. We also set it on conflict so re-running the import
  // backfills position onto rows imported before this fix landed.
  await db.execute(sql`
    INSERT INTO public.players
      (first_name, last_name, bref_id, pfr_id, sport, is_dst, nfl_team, position)
    VALUES
      (${params.firstName}, ${params.lastName}, ${params.pfrId}, ${params.pfrId}, 'football', false, ${params.nflTeam}, ${params.position})
    ON CONFLICT (pfr_id) WHERE pfr_id IS NOT NULL
      DO UPDATE SET nfl_team = EXCLUDED.nfl_team, position = EXCLUDED.position
  `);
}

async function processFootballLetter(
  db: PublicDb,
  letter: string,
): Promise<EligibleFootballPlayer[]> {
  const allPlayers = await getPlayersByLetter(letter);
  const eligible: EligibleFootballPlayer[] = [];
  let skipped = 0;

  for (const player of allPlayers) {
    const position = mapPfrPosition(player.rawPosition);
    if (!position) {
      skipped++;
      continue;
    }

    const { firstName, lastName } = splitName(player.name);
    const nflTeam = mapTeam(player.lastTeam);

    await upsertFootballPlayer(db, {
      firstName,
      lastName,
      pfrId: player.pfrId,
      nflTeam,
      position,
    });

    eligible.push({ pfrId: player.pfrId, position });
  }

  LOGGER.info(
    `${letter}: ${eligible.length} inserted/updated, ${skipped} skipped (untracked positions)`,
  );
  return eligible;
}

async function queueBaseballPlayers(
  letter?: string,
  skipQueue?: boolean,
): Promise<void> {
  const brefIds = await runWithPublicClient(
    getDbOptions(),
    async (db: PublicDb) => {
      const conditions = [eq(PublicSchema.players.sport, 'baseball')];
      if (letter) {
        conditions.push(
          like(PublicSchema.players.brefId, `${letter.toLowerCase()}%`),
        );
      }
      const rows = await db
        .select({ brefId: PublicSchema.players.brefId })
        .from(PublicSchema.players)
        .where(and(...conditions))
        .orderBy(PublicSchema.players.brefId);
      return rows.map((row) => row.brefId);
    },
  );

  LOGGER.info(`Found ${brefIds.length} baseball players`);
  if (brefIds.length === 0) {
    LOGGER.info('No baseball players to queue.');
    return;
  }

  if (skipQueue) {
    LOGGER.info(
      `Skipped SQS dispatch (--skip-queue): ${brefIds.length} baseball players`,
    );
    return;
  }

  const queueUrl = getEnvVarRequired(
    EnvironmentVariable.SQS_LOAD_SEASON_STATS_URL,
  );
  const sqs = new SQSClient({ region: REGION });
  const now = Date.now();
  const batches = chunkIntoBatches(brefIds).map((batch, idx) =>
    buildBaseballBatchEntries(batch, idx, now),
  );
  await dispatchBatches(sqs, queueUrl, batches);
  LOGGER.info(`✅ Successfully queued all ${brefIds.length} baseball players!`);
}

async function queueFootballPlayers(
  letter?: string,
  skipQueue?: boolean,
): Promise<void> {
  const letters = letter ? [letter.toUpperCase()] : ALL_LETTERS;

  LOGGER.info(
    `NFL player load pipeline — processing ${letters.length} letter(s)`,
  );

  await runWithPublicClient(getDbOptions(), async (db: PublicDb) => {
    const allEligible: EligibleFootballPlayer[] = [];

    for (const l of letters) {
      LOGGER.info(`Processing letter ${l}...`);
      try {
        const eligible = await processFootballLetter(db, l);
        allEligible.push(...eligible);
      } catch (err) {
        LOGGER.error(`Failed to process letter ${l}`, err);
      }
    }

    LOGGER.info(`Total eligible players upserted: ${allEligible.length}`);
    if (allEligible.length === 0) {
      LOGGER.info('No eligible players to queue.');
      return;
    }

    if (skipQueue) {
      LOGGER.info(
        `Skipped SQS dispatch (--skip-queue): upserted ${allEligible.length} players`,
      );
      return;
    }

    const queueUrl = getEnvVarRequired(
      EnvironmentVariable.FOOTBALL_STATS_QUEUE_URL,
    );
    const sqs = new SQSClient({ region: REGION });
    const now = Date.now();
    const batches = chunkIntoBatches(allEligible).map((batch, idx) =>
      buildFootballBatchEntries(batch, idx, now),
    );
    await dispatchBatches(sqs, queueUrl, batches);
    LOGGER.info(
      `✅ Successfully queued ${allEligible.length} football players.`,
    );
  });
}

export async function handleQueuePlayers(
  args: HandleQueuePlayersArgs,
): Promise<void> {
  const { sport, letter, skipQueue } = args;

  if (sport === 'baseball') {
    await queueBaseballPlayers(letter, skipQueue);
  } else {
    await queueFootballPlayers(letter, skipQueue);
  }
}

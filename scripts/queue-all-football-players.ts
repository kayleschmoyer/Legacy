#!/usr/bin/env -S pnpm exec tsx
// NFL player initial load pipeline — scrapes PFR A-Z index, upserts players
// into the DB, and queues each to SQS for stats loading (LS-4157).
//
// Mirrors scripts/queue-all-players.js (baseball) but performs discovery
// via PFR scraping rather than reading from the existing DB.
//
// Run: pnpm exec tsx scripts/queue-all-football-players.ts [--letter M]
//   --letter <X>  Process only that letter (for testing)
//
// Required environment variables:
//   DB_SECRET_NAME          — Secrets Manager secret holding DB credentials
//   FOOTBALL_STATS_QUEUE_URL — SQS FIFO URL for the stats-football lambda
//
// Optional environment variables:
//   DB_HOST                 — Postgres host (default: localhost for SSM tunnel)
//   DB_PORT                 — Postgres port (default: 5432)

import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import pg from 'pg';
import axios from 'axios';
import htmlParser from 'node-html-parser';
import { LOGGER } from '@legacy-sports/logging';

const { Client } = pg;

const REGION = 'us-east-1';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);

const SECRET_NAME = process.env.DB_SECRET_NAME;
const QUEUE_URL = process.env.FOOTBALL_STATS_QUEUE_URL;

if (!SECRET_NAME) {
  LOGGER.error('DB_SECRET_NAME environment variable is required');
  process.exit(1);
}
if (!QUEUE_URL) {
  LOGGER.error('FOOTBALL_STATS_QUEUE_URL environment variable is required');
  process.exit(1);
}

// Max 20 requests/minute as required by PFR robots.txt constraints.
const MAX_REQUESTS_PER_MINUTE = 20;
const MIN_GAP_MS = Math.ceil((60 * 1000) / MAX_REQUESTS_PER_MINUTE);

// Maps PFR raw position strings to our internal player_position enum values.
// Positions absent from this map (e.g. P, LS, OL, T, G, C) are skipped — not
// tracked in fantasy football scoring.
const POSITION_MAP: Record<string, string> = {
  QB: 'QB',
  RB: 'RB',
  FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'K',
  DE: 'DL',
  DT: 'DL',
  NT: 'DL',
  ILB: 'LB',
  OLB: 'LB',
  MLB: 'LB',
  LB: 'LB',
  CB: 'DB',
  S: 'DB',
  FS: 'DB',
  SS: 'DB',
  DB: 'DB',
};

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

let lastRequestTime = 0;

async function rateLimitedGet(url: string): Promise<string> {
  const now = Date.now();
  const gap = now - lastRequestTime;
  if (gap < MIN_GAP_MS) {
    await new Promise((res) => setTimeout(res, MIN_GAP_MS - gap));
  }
  lastRequestTime = Date.now();
  const response = await axios.get<string>(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; legacy-sports-data-loader/1.0)',
    },
    timeout: 30_000,
  });
  return response.data;
}

interface PfrPlayer {
  pfrId: string;
  name: string;
  rawPosition: string;
  lastTeam: string | null;
}

async function getPlayersByLetter(letter: string): Promise<PfrPlayer[]> {
  const url = `https://www.pro-football-reference.com/players/${letter.toUpperCase()}/`;
  const html = await rateLimitedGet(url);

  let root;
  try {
    root = htmlParser(html);
  } catch (err) {
    LOGGER.warn(`Failed to parse HTML for letter ${letter}`, err);
    return [];
  }

  const listDiv = root.getElementById('div_players_');
  if (!listDiv) {
    LOGGER.warn(`No player list div found for letter ${letter}`);
    return [];
  }

  const result: PfrPlayer[] = [];
  for (const el of listDiv.querySelectorAll('p')) {
    const anchor = el.querySelector('a');
    if (!anchor) continue;

    const href = anchor.getAttribute('href') ?? '';
    const match = href.match(/\/players\/[A-Z]\/([A-Za-z0-9]+)\.htm$/);
    if (!match) continue;

    const pfrId = match[1];
    const name = anchor.text.trim();

    // Text after the player name contains position and optional team, e.g.:
    // "Patrick Mahomes QB (2017-2024) (KC)"
    const elText = el.text.trim();
    const afterName = elText.slice(name.length).trim();

    const posMatch = afterName.match(/^([A-Z/]+)/);
    const rawPosition = posMatch ? posMatch[1] : '';

    // Last team appears as a trailing "(ABBR)" token
    const teamMatch = afterName.match(/\(([A-Z]{2,3})\)\s*$/);
    const lastTeam = teamMatch ? teamMatch[1] : null;

    result.push({ pfrId, name, rawPosition, lastTeam });
  }

  return result;
}

function mapPosition(rawPosition: string): string | null {
  if (!rawPosition) return null;
  // Handle slash-separated positions (e.g. "QB/RB") — use first recognized
  for (const part of rawPosition.split('/')) {
    const upper = part.trim().toUpperCase();
    if (upper in POSITION_MAP) return POSITION_MAP[upper];
  }
  return null;
}

function mapTeam(pfrTeam: string | null): string | null {
  if (!pfrTeam) return null;
  if (pfrTeam in PFR_TEAM_MAP) return PFR_TEAM_MAP[pfrTeam];
  // Pass through as-is for abbreviations that match our nfl_teams table
  return pfrTeam;
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

async function getDbClient(): Promise<InstanceType<typeof Client>> {
  const sm = new SecretsManagerClient({ region: REGION });
  const resp = await sm.send(
    new GetSecretValueCommand({ SecretId: SECRET_NAME }),
  );
  let creds: { dbname: string; username: string; password: string };
  try {
    creds = JSON.parse(resp.SecretString ?? '');
  } catch (err) {
    throw new Error(
      `Failed to parse DB secret JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    database: creds.dbname,
    user: creds.username,
    password: creds.password,
  });
  await client.connect();
  return client;
}

async function upsertPlayer(
  db: InstanceType<typeof Client>,
  params: {
    firstName: string;
    lastName: string;
    pfrId: string;
    nflTeam: string | null;
  },
): Promise<void> {
  // bref_id is NOT NULL in the schema; football players use pfr_id as the
  // bref_id value (DST players use the 'dst_ABBR' convention).
  // ON CONFLICT uses the partial unique index on pfr_id (WHERE pfr_id IS NOT NULL).
  await db.query(
    `
    INSERT INTO public.players
      (first_name, last_name, bref_id, pfr_id, sport, is_dst, nfl_team)
    VALUES
      ($1, $2, $3, $3, 'football', false, $4)
    ON CONFLICT (pfr_id) WHERE pfr_id IS NOT NULL
      DO UPDATE SET nfl_team = EXCLUDED.nfl_team
    `,
    [params.firstName, params.lastName, params.pfrId, params.nflTeam],
  );
}

interface EligiblePlayer {
  pfrId: string;
  position: string;
}

async function queueBatch(
  sqs: SQSClient,
  players: EligiblePlayer[],
  batchIdx: number,
): Promise<void> {
  const timestamp = Date.now();
  const entries = players.map((player, idx) => ({
    Id: `${batchIdx}-${idx}`,
    MessageBody: JSON.stringify({
      pfrId: player.pfrId,
      position: player.position,
    }),
    MessageGroupId: `letter-${player.pfrId[0].toUpperCase()}`,
    MessageDeduplicationId: `${player.pfrId}-${timestamp}-${batchIdx}-${idx}`,
  }));

  await sqs.send(
    new SendMessageBatchCommand({
      QueueUrl: QUEUE_URL,
      Entries: entries,
    }),
  );
}

async function queuePlayers(players: EligiblePlayer[]): Promise<void> {
  const sqs = new SQSClient({ region: REGION });
  const batches: EligiblePlayer[][] = [];
  for (let i = 0; i < players.length; i += 10) {
    batches.push(players.slice(i, i + 10));
  }

  LOGGER.info(
    `Queuing ${players.length} players in ${batches.length} SQS batches...`,
  );

  for (let i = 0; i < batches.length; i++) {
    await queueBatch(sqs, batches[i], i);
    if ((i + 1) % 100 === 0) {
      LOGGER.info(`Queued ${(i + 1) * 10} / ${players.length} players...`);
    }
  }
}

async function processLetter(
  db: InstanceType<typeof Client>,
  letter: string,
): Promise<EligiblePlayer[]> {
  const allPlayers = await getPlayersByLetter(letter);
  const eligible: EligiblePlayer[] = [];
  let skipped = 0;

  for (const player of allPlayers) {
    const position = mapPosition(player.rawPosition);
    if (!position) {
      skipped++;
      continue;
    }

    const { firstName, lastName } = splitName(player.name);
    const nflTeam = mapTeam(player.lastTeam);

    await upsertPlayer(db, {
      firstName,
      lastName,
      pfrId: player.pfrId,
      nflTeam,
    });

    eligible.push({ pfrId: player.pfrId, position });
  }

  LOGGER.info(
    `${letter}: ${eligible.length} inserted/updated, ${skipped} skipped (P/LS/OL/line)`,
  );
  return eligible;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const letterIdx = args.indexOf('--letter');
  const singleLetter =
    letterIdx !== -1 ? args[letterIdx + 1]?.toUpperCase() : null;

  const letters = singleLetter
    ? [singleLetter]
    : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  LOGGER.info(
    `NFL player load pipeline — processing ${letters.length} letter(s)`,
  );

  const db = await getDbClient();
  const allEligible: EligiblePlayer[] = [];

  try {
    for (const letter of letters) {
      LOGGER.info(`Processing letter ${letter}...`);
      try {
        const eligible = await processLetter(db, letter);
        allEligible.push(...eligible);
      } catch (err) {
        LOGGER.error(`Failed to process letter ${letter}`, err);
      }
    }

    LOGGER.info(`Total eligible players upserted: ${allEligible.length}`);

    if (allEligible.length > 0) {
      await queuePlayers(allEligible);
      LOGGER.info(`Successfully queued ${allEligible.length} players.`);
    } else {
      LOGGER.info('No eligible players to queue.');
    }
  } finally {
    await db.end();
  }
}

main().catch((err: unknown) => {
  LOGGER.error('Fatal error', err);
  process.exit(1);
});

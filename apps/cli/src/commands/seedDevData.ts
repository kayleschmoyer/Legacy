import { getPlayers, Letter } from '@legacy-sports/bref-client';
import { loadCareerStats } from '@legacy-sports/data-loaders';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import {
  bulkCreatePlayers,
  refreshPlayerEligiblePositions,
  runWithPublicClient,
} from '@legacy-sports/db-client';

export interface SeedDevDataArgs {
  /** Comma-separated letters to pull players from, e.g. "a,b" (default: "a,b") */
  letters?: string;
  /** How many players to load career stats for after inserting (default: 25) */
  statsLimit?: number;
  /** Only insert players — skip the stats loading step */
  skipStats?: boolean;
  /** Only load stats for already-present players — skip the player insert step */
  skipPlayers?: boolean;
}

const DEFAULT_LETTERS: Letter[] = ['a', 'b'];
const DEFAULT_STATS_LIMIT = 25;

function parseLetters(raw?: string): Letter[] {
  if (!raw) return DEFAULT_LETTERS;
  const valid: Letter[] = [];
  for (const char of raw.split(',')) {
    const l = char.trim().toLowerCase() as Letter;
    if (/^[a-z]$/.test(l)) {
      valid.push(l);
    } else {
      LOGGER.warn(`Ignoring invalid letter "${char.trim()}"`);
    }
  }
  return valid.length > 0 ? valid : DEFAULT_LETTERS;
}

export async function handleSeedDevData(args: SeedDevDataArgs): Promise<void> {
  const letters = parseLetters(args.letters);
  const statsLimit = args.statsLimit ?? DEFAULT_STATS_LIMIT;

  LOGGER.info('🌱 Seeding local dev database with player data');
  LOGGER.info(`   Letters  : ${letters.join(', ').toUpperCase()}`);
  LOGGER.info(`   Stats cap: ${args.skipStats ? 'skipped' : statsLimit}`);
  LOGGER.info('');

  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db) => {
    // -------------------------------------------------------------------------
    // Step 1: insert players
    // -------------------------------------------------------------------------
    const insertedBrefIds: string[] = [];

    if (!args.skipPlayers) {
      LOGGER.info('📥 Step 1/2 — Loading players from Baseball Reference...');
      let totalInserted = 0;

      for (const letter of letters) {
        try {
          LOGGER.info(
            `  Fetching players for letter ${letter.toUpperCase()}...`,
          );
          const playerInfos = await getPlayers(letter);

          if (playerInfos.length === 0) {
            LOGGER.info(`  No players found for ${letter.toUpperCase()}`);
            continue;
          }

          LOGGER.info(`  Found ${playerInfos.length} players — upserting...`);
          const created = await bulkCreatePlayers(db, playerInfos);
          totalInserted += created.length;
          insertedBrefIds.push(...created.map((p) => p.brefId));

          LOGGER.info(
            `  ✓ ${letter.toUpperCase()}: ${created.length} players upserted (running total: ${totalInserted})`,
          );
        } catch (err) {
          LOGGER.error(
            `  ✗ Error loading players for ${letter.toUpperCase()}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          throw err;
        }
      }

      LOGGER.info(`\n✅ Players: ${totalInserted} upserted\n`);
    } else {
      LOGGER.info('⏭️  Step 1/2 — Skipping player insert (--skip-players)\n');
    }

    // -------------------------------------------------------------------------
    // Step 2: load career stats for the first N players
    // -------------------------------------------------------------------------
    if (args.skipStats) {
      LOGGER.info('⏭️  Step 2/2 — Skipping stats load (--skip-stats)');
      return;
    }

    LOGGER.info(
      `📊 Step 2/2 — Loading career stats (up to ${statsLimit} players)...`,
    );

    // If we didn't just insert, pull from DB so --skip-players + stats still works
    const brefIds =
      insertedBrefIds.length > 0
        ? insertedBrefIds.slice(0, statsLimit)
        : await db.query.players
            .findMany({ columns: { brefId: true }, limit: statsLimit })
            .then((rows) => rows.map((r) => r.brefId));

    const toLoad = brefIds.slice(0, statsLimit);

    if (toLoad.length === 0) {
      LOGGER.warn(
        'No players available to load stats for. Run without --skip-players first.',
      );
      return;
    }

    let statsOk = 0;
    let statsFail = 0;

    for (let i = 0; i < toLoad.length; i++) {
      const brefId = toLoad[i];
      try {
        process.stdout.write(
          `  [${i + 1}/${toLoad.length}] ${brefId.padEnd(12)} … `,
        );
        await loadCareerStats(db, brefId);
        process.stdout.write('✓\n');
        statsOk++;
      } catch (err) {
        process.stdout.write(
          `✗ ${err instanceof Error ? err.message : String(err)}\n`,
        );
        statsFail++;
        // continue — don't abort the whole seed for one bad player
      }
    }

    LOGGER.info('');
    LOGGER.info(
      `✅ Stats loaded: ${statsOk} succeeded, ${statsFail} failed out of ${toLoad.length}`,
    );
    // Refresh materialized view once all player stats have been seeded
    if (statsOk > 0) {
      try {
        LOGGER.info(
          'Refreshing player_eligible_positions materialized view...',
        );
        await refreshPlayerEligiblePositions(db);
        LOGGER.info('player_eligible_positions materialized view refreshed.');
      } catch (refreshError) {
        LOGGER.warn(
          `Failed to refresh player_eligible_positions: ${String(refreshError)}`,
        );
      }
    }
  });

  LOGGER.info('');
  LOGGER.info('🎉 Dev seed complete!');
  LOGGER.info(
    `   Run \`list-players\` to browse loaded players, or connect to the DB directly.`,
  );
}

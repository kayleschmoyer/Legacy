import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import { PublicDb, runWithPublicClient } from '@legacy-sports/db-client';
import { sql } from 'drizzle-orm';
import {
  aggregateNflverseSeasonStats,
  applyMultiTeamRepairs,
  buildPfrToGsisCrosswalk,
  CATEGORY_TABLE,
  computeMultiTeamRepairs,
  ExistingSeasonRow,
  fetchNflverseCsvText,
  FootballStatCategory,
  NFLVERSE_CATEGORY_CONFIGS,
  NFLVERSE_CSV_URLS,
  parseNflverseCsv,
} from '@legacy-sports/data-loaders';

/**
 * Repairs multi-team football season rows for the 1999+ tranche (LS-9919)
 * using nflverse as ground truth — no PFR requests. See
 * `backfill-nflverse-multiteam-seasons.ts` in `@legacy-sports/data-loaders`
 * for the combination/diff logic and licensing note.
 */

export interface BackfillNflverseMultiTeamSeasonsArgs {
  dryRun?: boolean;
}

/** 1999+ players whose whole career falls in scope, with their pfr_id. */
async function loadEligiblePlayers(db: PublicDb): Promise<Map<number, string>> {
  const result = await db.execute<{ id: number; pfr_id: string }>(sql`
    WITH seasons AS (
      SELECT player_id, season FROM football_season_passing
      UNION ALL SELECT player_id, season FROM football_season_rushing
      UNION ALL SELECT player_id, season FROM football_season_receiving
      UNION ALL SELECT player_id, season FROM football_season_kicking
      UNION ALL SELECT player_id, season FROM football_season_defense_idp
    ), per_player AS (
      SELECT player_id, min(season) AS min_season FROM seasons GROUP BY player_id
    )
    SELECT pl.id, pl.pfr_id
    FROM per_player pp
    JOIN players pl ON pl.id = pp.player_id
    WHERE pp.min_season >= 1999 AND pl.pfr_id IS NOT NULL AND pl.pfr_id <> ''
  `);
  return new Map(result.rows.map((r) => [r.id, r.pfr_id]));
}

async function loadExistingRows(
  db: PublicDb,
  table: string,
  playerIds: number[],
): Promise<ExistingSeasonRow[]> {
  if (playerIds.length === 0) return [];
  const result = await db.execute<{
    player_id: number;
    season: number;
    team: string;
  }>(
    sql`SELECT player_id, season, team FROM ${sql.raw(table)} WHERE player_id = ANY(${playerIds})`,
  );
  return result.rows.map((r) => ({
    playerId: r.player_id,
    season: r.season,
    team: r.team,
  }));
}

export async function handleBackfillNflverseMultiTeamSeasons(
  args: BackfillNflverseMultiTeamSeasonsArgs,
): Promise<void> {
  const dryRun = args.dryRun ?? true; // writing to shared data defaults to safe
  LOGGER.info(
    `nflverse multi-team season backfill (LS-9919) — dryRun=${dryRun}`,
  );
  LOGGER.info(
    'Data source: nflverse-data (CC-BY 4.0, https://github.com/nflverse/nflverse-data) — confirmed per LS-9908.',
  );

  const opts = getDbOptions();
  await runWithPublicClient(opts, async (db) => {
    const eligiblePlayers = await loadEligiblePlayers(db);
    LOGGER.info(`Eligible 1999+ players: ${eligiblePlayers.size}`);

    LOGGER.info('Fetching nflverse crosswalk + weekly stats...');
    const [playersCsv, offenseCsv, defenseCsv, kickingCsv] = await Promise.all([
      fetchNflverseCsvText(NFLVERSE_CSV_URLS.players),
      fetchNflverseCsvText(NFLVERSE_CSV_URLS.offense),
      fetchNflverseCsvText(NFLVERSE_CSV_URLS.defense),
      fetchNflverseCsvText(NFLVERSE_CSV_URLS.kicking),
    ]);

    const pfrToGsis = buildPfrToGsisCrosswalk(parseNflverseCsv(playersCsv));
    const gsisToPlayer = new Map<string, { playerId: number; pfrId: string }>();
    const gsisIds = new Set<string>();
    let unmatched = 0;
    for (const [playerId, pfrId] of eligiblePlayers) {
      const gsis = pfrToGsis.get(pfrId);
      if (!gsis) {
        unmatched++;
        continue;
      }
      gsisToPlayer.set(gsis, { playerId, pfrId });
      gsisIds.add(gsis);
    }
    LOGGER.info(
      `Crosswalk matched ${gsisToPlayer.size}/${eligiblePlayers.size} players to nflverse (${unmatched} unmatched — no gsis_id for this pfr_id).`,
    );

    const offenseRows = parseNflverseCsv(offenseCsv);
    const defenseRows = parseNflverseCsv(defenseCsv);
    const kickingRows = parseNflverseCsv(kickingCsv);

    const rowsByCategory: Record<FootballStatCategory, typeof offenseRows> = {
      passing: offenseRows,
      rushing: offenseRows,
      receiving: offenseRows,
      kicking: kickingRows,
      defense_idp: defenseRows,
    };
    const categoryAggs = Object.fromEntries(
      (Object.keys(rowsByCategory) as FootballStatCategory[]).map((c) => [
        c,
        aggregateNflverseSeasonStats(
          rowsByCategory[c],
          NFLVERSE_CATEGORY_CONFIGS[c],
          gsisIds,
        ),
      ]),
    ) as Record<
      FootballStatCategory,
      ReturnType<typeof aggregateNflverseSeasonStats>
    >;

    const playerIds = [...eligiblePlayers.keys()];

    let totalRepaired = 0;
    let totalNflverseMultiTeam = 0;
    for (const category of Object.keys(
      categoryAggs,
    ) as FootballStatCategory[]) {
      const existingRows = await loadExistingRows(
        db,
        CATEGORY_TABLE[category],
        playerIds,
      );
      const repairs = computeMultiTeamRepairs(
        categoryAggs[category],
        existingRows,
        gsisToPlayer,
      );
      const nflverseMultiTeam = [...categoryAggs[category].values()].reduce(
        (sum, bySeason) =>
          sum + [...bySeason.values()].filter((a) => a.teams.length > 1).length,
        0,
      );
      totalNflverseMultiTeam += nflverseMultiTeam;
      totalRepaired += repairs.length;
      LOGGER.info(
        `${category}: ${existingRows.length} existing DB rows, ${nflverseMultiTeam} nflverse multi-team player-seasons, ${repairs.length} repaired`,
      );
      await applyMultiTeamRepairs(db, category, repairs, { dryRun });
    }

    LOGGER.info(
      `Done. ${totalRepaired} season row(s) repaired across all categories ` +
        `(${totalNflverseMultiTeam} true multi-team player-seasons observed in nflverse for this player set; ` +
        `the rest had no existing PFR-sourced row to repair, so were left alone).`,
    );
  });
}

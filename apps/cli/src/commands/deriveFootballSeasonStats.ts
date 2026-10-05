import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import { runWithPublicClient } from '@legacy-sports/db-client';
import {
  isFootballCorpusConfigured,
  NFLVERSE_ATTRIBUTION,
  PFA_FIRST_SEASON,
  PFA_LAST_SEASON,
  PfaCareerStats,
  resolveFootballCorpusKey,
} from '@legacy-sports/football-game-stats-provider';
import {
  aggregateNflverseSeasonStats,
  applyDerivedPlayerStats,
  buildCareerRows,
  buildNflverseSeasonRows,
  buildPfaSeasonRows,
  buildPfrRookieSeasonMap,
  buildPfrToGsisCrosswalk,
  countDerivedSeasonRows,
  DerivationCandidate,
  DerivedSeasonRows,
  fetchNflverseCsvText,
  FootballStatCategory,
  isIdpPosition,
  loadDerivationCandidates,
  mayHavePfaSeasons,
  mergeDerivedSeasonRows,
  NFLVERSE_CATEGORY_CONFIGS,
  NFLVERSE_CSV_URLS,
  NflversePlayerAggregates,
  NflverseRow,
  parseNflverseCsv,
  restrictToPositionGroup,
} from '@legacy-sports/data-loaders';

/**
 * Derives football_season_* and career_football_* rows from per-game data for
 * football players that have no stat rows yet (LS-10586). 1999+ comes from
 * nflverse weekly stats, 1960-1998 from the PFA corpus in S3, read by corpus
 * key (`pfr_id ?? 'pfa-' || pfa_id`, ADR 0023) so a player with no PFR id
 * (LS-10588) derives from its pfa-<pfaId> objects. See
 * `derive-football-season-stats.ts` in `@legacy-sports/data-loaders` for the
 * aggregation and the never-overwrite guarantees.
 *
 * Dry-run by default; `--apply` writes. Reads S3 (when
 * FOOTBALL_CORPUS_S3_BUCKET is set) and GitHub, never writes to either.
 */

export interface DeriveFootballSeasonStatsArgs {
  apply?: boolean;
  playerIds?: number[];
}

/** Parses `--player-ids 12,34 56` into a de-duplicated id list. */
export function parsePlayerIds(value: string): number[] {
  const ids = value
    .split(/[\s,]+/)
    .filter((part) => part.length > 0)
    .map((part) => {
      const id = Number(part);
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`Invalid player id: "${part}"`);
      }
      return id;
    });
  return [...new Set(ids)];
}

// S3 GETs per player in flight at once while probing 1960-1998.
const PFA_CONCURRENCY = 8;

async function readPfaSeasons(
  candidate: DerivationCandidate,
): Promise<DerivedSeasonRows> {
  const seasons: number[] = [];
  for (let s = PFA_FIRST_SEASON; s <= PFA_LAST_SEASON; s++) seasons.push(s);

  const parts: DerivedSeasonRows[] = [];
  for (let i = 0; i < seasons.length; i += PFA_CONCURRENCY) {
    const batch = seasons.slice(i, i + PFA_CONCURRENCY);
    const logs = await Promise.all(
      batch.map((season) =>
        PfaCareerStats.getGameLog(
          {
            id: candidate.playerId,
            pfrId: candidate.pfrId,
            pfaId: candidate.pfaId,
          },
          season,
        ),
      ),
    );
    logs.forEach((log, j) => {
      if (log)
        parts.push(buildPfaSeasonRows(candidate.playerId, batch[j], log));
    });
  }
  return mergeDerivedSeasonRows(...parts);
}

function aggregateAll(
  rows: Record<FootballStatCategory, NflverseRow[]>,
  gsisIds: ReadonlySet<string>,
) {
  const out = {} as Record<
    FootballStatCategory,
    ReturnType<typeof aggregateNflverseSeasonStats>
  >;
  for (const category of Object.keys(rows) as FootballStatCategory[]) {
    out[category] = aggregateNflverseSeasonStats(
      rows[category],
      NFLVERSE_CATEGORY_CONFIGS[category],
      gsisIds,
    );
  }
  return out;
}

export async function handleDeriveFootballSeasonStats(
  args: DeriveFootballSeasonStatsArgs,
): Promise<void> {
  const dryRun = !args.apply;
  LOGGER.info(
    `Derive football season/career stats from per-game data (LS-10586) — dryRun=${dryRun}` +
      (args.playerIds ? `, playerIds=${args.playerIds.join(',')}` : ''),
  );
  LOGGER.info(NFLVERSE_ATTRIBUTION);

  const pfaEnabled = isFootballCorpusConfigured();
  if (!pfaEnabled) {
    LOGGER.warn(
      'FOOTBALL_CORPUS_S3_BUCKET is not set — 1960-1998 (PFA) seasons will be skipped; only nflverse 1999+ seasons are derived.',
    );
  }

  await runWithPublicClient(getDbOptions(), async (db) => {
    const candidates = await loadDerivationCandidates(db, args.playerIds);
    LOGGER.info(
      `Candidates (football, non-DST, pfr_id or pfa_id set, no season/career rows): ${candidates.length}`,
    );
    if (args.playerIds) {
      const found = new Set(candidates.map((c) => c.playerId));
      const skipped = args.playerIds.filter((id) => !found.has(id));
      if (skipped.length > 0) {
        LOGGER.info(
          `Not candidates (unknown, not football, no pfr_id/pfa_id, or already have stat rows — left untouched): ${skipped.join(',')}`,
        );
      }
    }
    if (candidates.length === 0) return;

    LOGGER.info('Fetching nflverse crosswalk + weekly stats...');
    const [playersCsv, offenseCsv, defenseCsv, kickingCsv] = await Promise.all([
      fetchNflverseCsvText(NFLVERSE_CSV_URLS.players),
      fetchNflverseCsvText(NFLVERSE_CSV_URLS.offense),
      fetchNflverseCsvText(NFLVERSE_CSV_URLS.defense),
      fetchNflverseCsvText(NFLVERSE_CSV_URLS.kicking),
    ]);
    const playersRows = parseNflverseCsv(playersCsv);
    const pfrToGsis = buildPfrToGsisCrosswalk(playersRows);
    const rookieSeasons = buildPfrRookieSeasonMap(playersRows);

    const gsisIds = new Set<string>();
    for (const c of candidates) {
      const gsis = c.pfrId ? pfrToGsis.get(c.pfrId) : undefined;
      if (gsis) gsisIds.add(gsis);
    }
    const offenseRows = parseNflverseCsv(offenseCsv);
    const aggs = aggregateAll(
      {
        passing: offenseRows,
        rushing: offenseRows,
        receiving: offenseRows,
        kicking: parseNflverseCsv(kickingCsv),
        defense_idp: parseNflverseCsv(defenseCsv),
      },
      gsisIds,
    );

    const totals = {
      playersWithRows: 0,
      playersWithoutData: 0,
      playersWritten: 0,
      playersSkippedAtWrite: 0,
      nflverseRows: 0,
      pfaRows: 0,
    };
    const samples: string[] = [];

    for (const candidate of candidates) {
      const { pfrId } = candidate;
      const corpusKey = resolveFootballCorpusKey(candidate);
      // A player with no PFR id (ADR 0023) is not in nflverse at all, so only
      // the PFA corpus can hold their games.
      const gsis = pfrId ? pfrToGsis.get(pfrId) : undefined;
      const playerAggs: NflversePlayerAggregates = {};
      if (gsis) {
        for (const category of Object.keys(aggs) as FootballStatCategory[]) {
          playerAggs[category] = aggs[category].get(gsis);
        }
      }
      const nflverseRows = pfrId
        ? restrictToPositionGroup(
            buildNflverseSeasonRows(candidate.playerId, pfrId, playerAggs),
            candidate.position,
          )
        : mergeDerivedSeasonRows();
      // PFA has no IDP data, so an IDP player never needs the S3 probe.
      const pfaRows =
        pfaEnabled &&
        !isIdpPosition(candidate.position) &&
        mayHavePfaSeasons(pfrId ? rookieSeasons.get(pfrId) : undefined)
          ? await readPfaSeasons(candidate)
          : mergeDerivedSeasonRows();

      const seasons = mergeDerivedSeasonRows(nflverseRows, pfaRows);
      const rowCount = countDerivedSeasonRows(seasons);
      if (rowCount === 0) {
        totals.playersWithoutData++;
        continue;
      }
      totals.playersWithRows++;
      totals.nflverseRows += countDerivedSeasonRows(nflverseRows);
      totals.pfaRows += countDerivedSeasonRows(pfaRows);

      const careers = buildCareerRows(candidate.playerId, seasons);
      if (samples.length < 10) {
        samples.push(
          `  ${corpusKey} (id ${candidate.playerId}): ` +
            `${countDerivedSeasonRows(nflverseRows)} nflverse + ${countDerivedSeasonRows(pfaRows)} pfa season rows; ` +
            `career passing yds=${careers.passing?.yds ?? '-'}, rushing yds=${careers.rushing?.yds ?? '-'}, ` +
            `receiving yds=${careers.receiving?.yds ?? '-'}, fgm=${careers.kicking?.fgm ?? '-'}, ` +
            `idp seasons=${seasons.defenseIdp.length}`,
        );
      }

      if (!dryRun) {
        const written = await applyDerivedPlayerStats(
          db,
          candidate.playerId,
          seasons,
          careers,
        );
        if (written) totals.playersWritten++;
        else totals.playersSkippedAtWrite++;
      }
    }

    LOGGER.info(`Sample:\n${samples.join('\n')}`);
    LOGGER.info(
      `${dryRun ? '[dry-run] Would derive' : 'Derived'} rows for ${totals.playersWithRows} player(s): ` +
        `${totals.nflverseRows} nflverse + ${totals.pfaRows} pfa season rows. ` +
        `${totals.playersWithoutData} candidate(s) had no per-game data in either source.`,
    );
    if (!dryRun) {
      LOGGER.info(
        `Wrote ${totals.playersWritten} player(s); skipped ${totals.playersSkippedAtWrite} that gained stat rows before the write. ` +
          'Run refresh_football_player_scoring_cache(NULL) to surface them on the draft board.',
      );
    } else {
      LOGGER.info('Dry run — nothing written. Re-run with --apply to write.');
    }
  });
}

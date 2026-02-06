import { Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import {
  PublicDb,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { and, eq } from 'drizzle-orm';
import type { ArgsType } from './ArgsType';

export const triggerGameSelectionCommandBuilder = (argv: Argv) =>
  argv
    .usage('trigger-game-selection')
    .option('matchup-id', {
      alias: 'm',
      type: 'number',
      description:
        'Specific matchup ID to trigger (default: all matchups with pending stats)',
    })
    .option('dry-run', {
      type: 'boolean',
      default: false,
      description: 'Show what would be done without making changes',
    });

type HandleTriggerGameSelectionArgs = ArgsType<
  ReturnType<typeof triggerGameSelectionCommandBuilder>
>;

interface MatchupPendingStats {
  matchupId: number;
  leagueId: number;
  weekNumber: number;
  pendingCount: number;
}

async function getMatchupsWithPendingStats(
  db: PublicDb,
  matchupId?: number,
): Promise<MatchupPendingStats[]> {
  // Build where conditions
  const conditions = [
    eq(PublicSchema.matchupPlayerGames.statsLoadingStatus, 'pending'),
  ];
  if (matchupId !== undefined) {
    conditions.push(eq(PublicSchema.matchupPlayers.matchupId, matchupId));
  }

  // Query to get all matchup_player_games with pending status and join to get matchup info
  const results = await db
    .select({
      matchupPlayerId: PublicSchema.matchupPlayerGames.matchupPlayerId,
      matchupId: PublicSchema.matchupPlayers.matchupId,
      leagueId: PublicSchema.matchups.leagueId,
      weekNumber: PublicSchema.matchups.weekNumber,
    })
    .from(PublicSchema.matchupPlayerGames)
    .innerJoin(
      PublicSchema.matchupPlayers,
      eq(
        PublicSchema.matchupPlayerGames.matchupPlayerId,
        PublicSchema.matchupPlayers.id,
      ),
    )
    .innerJoin(
      PublicSchema.matchups,
      eq(PublicSchema.matchups.id, PublicSchema.matchupPlayers.matchupId),
    )
    .where(and(...conditions));

  // Count pending games per matchup and get matchup details
  const matchupMap = new Map<
    number,
    { leagueId: number; weekNumber: number; pendingCount: number }
  >();
  for (const row of results) {
    const existing = matchupMap.get(row.matchupId);
    if (existing) {
      existing.pendingCount++;
    } else {
      matchupMap.set(row.matchupId, {
        leagueId: row.leagueId,
        weekNumber: row.weekNumber,
        pendingCount: 1,
      });
    }
  }

  return Array.from(matchupMap.entries())
    .map(([matchupId, data]) => ({ matchupId, ...data }))
    .sort((a, b) => a.matchupId - b.matchupId);
}

async function triggerGameSelection(
  matchup: MatchupPendingStats,
  dryRun: boolean,
): Promise<boolean> {
  if (dryRun) {
    LOGGER.info(
      `[DRY RUN] Would trigger game selection for matchup ${matchup.matchupId} (league ${matchup.leagueId}, week ${matchup.weekNumber})`,
    );
    return true;
  }

  try {
    // Get API Gateway endpoint from environment
    const apiUrl =
      process.env.GAME_SELECTION_ENDPOINT ||
      'https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/games';
    const endpoint = `${apiUrl}/create-matchup`;

    LOGGER.info(
      `Triggering game selection for matchup ${matchup.matchupId}...`,
    );
    LOGGER.debug(`API endpoint: ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        league: matchup.leagueId,
        week: matchup.weekNumber,
      }),
    });

    const responseText = await response.text();
    let responseData: unknown;
    try {
      responseData = JSON.parse(responseText) as unknown;
    } catch {
      responseData = { body: responseText };
    }

    if (!response.ok) {
      LOGGER.error(`Failed to trigger game selection: HTTP ${response.status}`);
      LOGGER.error(`Response:`, responseData as Record<string, unknown>);
      return false;
    }

    LOGGER.info(
      `✅ Successfully triggered game selection for matchup ${matchup.matchupId}`,
    );
    LOGGER.debug('Response:', responseData as Record<string, unknown>);
    return true;
  } catch (error) {
    LOGGER.error(
      `Error triggering game selection for matchup ${matchup.matchupId}:`,
    );
    if (error instanceof Error) {
      LOGGER.error(error.message);
      LOGGER.error(error.stack);
    } else {
      LOGGER.error(String(error));
    }
    return false;
  }
}

export async function handleTriggerGameSelection(
  args: HandleTriggerGameSelectionArgs,
): Promise<void> {
  const matchupId = args['matchup-id'];
  const dryRun = args['dry-run'];
  const opts = getDbOptions();

  LOGGER.info('🎯 Trigger Game Selection');
  LOGGER.info('========================\n');

  if (dryRun) {
    LOGGER.info('🔍 DRY RUN MODE - No changes will be made\n');
  }

  await runWithPublicClient(opts, async (db) => {
    // Get matchups with pending stats
    const matchups = await getMatchupsWithPendingStats(db, matchupId);

    if (matchups.length === 0) {
      if (matchupId) {
        LOGGER.info(`ℹ️  Matchup ${matchupId} has no pending games`);
      } else {
        LOGGER.info('ℹ️  No matchups with pending games found');
      }
      return;
    }

    LOGGER.info(`Found ${matchups.length} matchup(s) with pending games:\n`);
    for (const matchup of matchups) {
      LOGGER.info(
        `  Matchup ${matchup.matchupId}: ${matchup.pendingCount} pending games`,
      );
    }
    LOGGER.info('');

    // Trigger game selection for each matchup
    let successCount = 0;
    let failCount = 0;

    for (const matchup of matchups) {
      const success = await triggerGameSelection(matchup, dryRun ?? false);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      // Small delay between requests to avoid overwhelming the API
      if (!dryRun && matchups.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    LOGGER.info('');
    LOGGER.info('Summary:');
    LOGGER.info(`  ✅ Success: ${successCount}`);
    if (failCount > 0) {
      LOGGER.info(`  ❌ Failed: ${failCount}`);
    }

    if (!dryRun && successCount > 0) {
      LOGGER.info('');
      LOGGER.info(
        '💡 Tip: Use "check-stats-status" command to monitor progress',
      );
    }
  });
}

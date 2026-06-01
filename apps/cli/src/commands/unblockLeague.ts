import { InvalidArgumentError } from 'commander';
import {
  createAllMatchupsForLeague,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';

interface HandleUnblockLeagueArgs {
  id: number;
}

/**
 * Commander option parser for --id. Accepts a positive integer league id and
 * rejects anything else (non-numeric, zero, negative, or fractional).
 */
export function parseLeagueId(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(
      `League id must be a positive integer, got '${value}'`,
    );
  }
  return parsed;
}

/**
 * Create all matchups for a stuck league by calling createAllMatchupsForLeague.
 *
 * A league can get stuck when a draft completes but the draft-processor Lambda
 * never generated its matchups. This command fixes any such league by id,
 * generalizing the former one-off scripts/unblock-league-93.ts (LS-5227).
 */
export async function handleUnblockLeague(
  args: HandleUnblockLeagueArgs,
): Promise<void> {
  const { id: leagueId } = args;

  LOGGER.info(`Creating matchups for league ${leagueId}...`);

  await runWithPublicClient(getDbOptions(), async (db) => {
    const result = await createAllMatchupsForLeague(db, leagueId);
    LOGGER.info(
      `Done! League ${leagueId} now has ${result.matchupCount} matchup(s); ` +
        `currentMatchupId=${result.currentMatchupId ?? 'null'}.`,
    );
  });
}

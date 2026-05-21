#!/usr/bin/env tsx
import { eq, sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import * as path from 'path';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { getPublicDbConnection } from '../index.js';
import { PublicSchema } from '../index.js';

// Load environment variables from root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function confirmDeletion(leagueId: number): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    LOGGER.warn(
      `⚠️  About to PERMANENTLY DELETE league ${leagueId} and ALL related data (teams, matchups, drafts, players, members). This cannot be undone.`,
    );
    const answer = await rl.question(
      `Type the league ID (${leagueId}) again to confirm: `,
    );
    return answer.trim() === String(leagueId);
  } finally {
    rl.close();
  }
}

async function deleteLeague(leagueId: number) {
  const dbOptions = getDbOptions();
  const db = getPublicDbConnection(dbOptions);

  try {
    await db.initialize();
    LOGGER.info(`Deleting league ${leagueId}...`);

    // Step 1: Find all related teams
    LOGGER.info(`Step 1: Finding all related teams...`);
    const teams = await db.db
      .select({ id: PublicSchema.teams.id })
      .from(PublicSchema.teams)
      .where(eq(PublicSchema.teams.leagueId, leagueId));

    const teamIds = teams.map((t) => t.id);
    LOGGER.info(`Found ${teamIds.length} teams`);

    if (teamIds.length > 0) {
      LOGGER.info(`Step 2: Deleting matchup_player_games...`);
      await db.db.execute(
        sql.raw(`
        DELETE FROM matchup_player_games
        WHERE matchup_player_id IN (
          SELECT id FROM matchup_players
          WHERE matchup_id IN (
            SELECT id FROM matchups WHERE league_id = ${leagueId}
          )
        )
      `),
      );

      LOGGER.info(`Step 3: Deleting matchup_players...`);
      await db.db.execute(
        sql.raw(`
        DELETE FROM matchup_players
        WHERE matchup_id IN (SELECT id FROM matchups WHERE league_id = ${leagueId})
      `),
      );

      LOGGER.info(`Step 4: Deleting matchups...`);
      await db.db.execute(
        sql.raw(`DELETE FROM matchups WHERE league_id = ${leagueId}`),
      );

      LOGGER.info(`Step 5: Deleting league_week_player_seasons...`);
      await db.db.execute(
        sql.raw(
          `DELETE FROM league_week_player_seasons WHERE league_id = ${leagueId}`,
        ),
      );

      LOGGER.info(`Step 6: Deleting draft_picks...`);
      await db.db.execute(
        sql.raw(
          `DELETE FROM draft_picks WHERE draft_id IN (SELECT id FROM drafts WHERE league_id = ${leagueId})`,
        ),
      );

      LOGGER.info(`Step 7: Deleting drafts...`);
      await db.db.execute(
        sql.raw(`DELETE FROM drafts WHERE league_id = ${leagueId}`),
      );

      LOGGER.info(`Step 8: Deleting team_players...`);
      await db.db.execute(
        sql.raw(
          `DELETE FROM team_players WHERE team_id IN (${teamIds.join(',')})`,
        ),
      );

      LOGGER.info(`Step 9: Deleting teams...`);
      await db.db.execute(
        sql.raw(`DELETE FROM teams WHERE league_id = ${leagueId}`),
      );
    }

    LOGGER.info(`Step 10: Deleting league_members...`);
    await db.db.execute(
      sql.raw(`DELETE FROM league_members WHERE league_id = ${leagueId}`),
    );

    LOGGER.info(`Step 11: Deleting league...`);
    await db.db.execute(sql.raw(`DELETE FROM leagues WHERE id = ${leagueId}`));

    LOGGER.info(
      `✅ League ${leagueId} and all related data deleted successfully`,
    );
    return true;
  } catch (error: unknown) {
    if (error instanceof Error) {
      LOGGER.error(`❌ Failed to delete league ${leagueId}`, error);
    } else {
      LOGGER.error(`❌ Failed to delete league ${leagueId}: ${String(error)}`);
    }
    throw error;
  } finally {
    try {
      await db.close();
    } catch {
      // Ignore close errors
    }
  }
}

async function main() {
  const rawId = process.argv[2];
  if (!rawId) {
    LOGGER.error('Usage: tsx delete-league.ts <leagueId>');
    process.exit(1);
  }
  const leagueId = parseInt(rawId, 10);
  if (isNaN(leagueId)) {
    LOGGER.error(`Invalid league ID: ${rawId}`);
    process.exit(1);
  }

  const confirmed = await confirmDeletion(leagueId);
  if (!confirmed) {
    LOGGER.info('Aborted: confirmation did not match. No data was deleted.');
    process.exit(1);
  }

  await deleteLeague(leagueId);
}

void main().catch((err: unknown) => {
  if (err instanceof Error) {
    LOGGER.error('delete-league script failed', err);
  } else {
    LOGGER.error(`delete-league script failed: ${String(err)}`);
  }
  process.exit(1);
});

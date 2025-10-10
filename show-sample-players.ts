#!/usr/bin/env tsx
/**
 * Show Sample Players from League 9 Draft
 * 
 * This script shows sample players assigned to teams in league 9
 */

import { runWithPublicClient, PublicSchema } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { eq } from 'drizzle-orm';

async function showSamplePlayers() {
  console.log('👥 Sample Players from League 9 Draft');
  console.log('======================================\n');

  try {
    const results = await runWithPublicClient(getDbOptions(), async (db) => {
      // Get first 3 teams
      const teams = await db.select({
        id: PublicSchema.teams.id,
        name: PublicSchema.teams.name,
      })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.leagueId, 9))
        .limit(3);

      for (const team of teams) {
        console.log(`🏈 Team: ${team.name} (ID: ${team.id})`);
        
        // Get first 5 players for this team
        const teamPlayers = await db.select({
          playerId: PublicSchema.teamMembers.playerId,
          playerName: PublicSchema.players.name,
          primaryPosition: PublicSchema.players.primaryPosition,
        })
          .from(PublicSchema.teamMembers)
          .innerJoin(PublicSchema.players, eq(PublicSchema.teamMembers.playerId, PublicSchema.players.id))
          .where(eq(PublicSchema.teamMembers.teamId, team.id))
          .limit(5);

        teamPlayers.forEach((player, index) => {
          console.log(`   ${index + 1}. ${player.playerName} (${player.primaryPosition})`);
        });
        
        console.log(`   ... and ${20 - teamPlayers.length} more players\n`);
      }

      return { teams };
    });

    return results;

  } catch (error) {
    console.error('❌ Error showing sample players:', error);
    throw error;
  }
}

// Run the check
showSamplePlayers()
  .then(() => {
    console.log('✅ Sample players displayed successfully');
  })
  .catch((error) => {
    console.error('\n💥 Failed to show sample players:', error);
    process.exit(1);
  });
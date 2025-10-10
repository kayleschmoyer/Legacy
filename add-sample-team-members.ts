// Script to add sample team members for testing roster management
import { runWithPublicClient, PublicSchema } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { eq } from 'drizzle-orm';

async function addSampleTeamMembers() {
  console.log('🧪 Adding sample team members for testing...');
  
  try {
    await runWithPublicClient(getDbOptions(), async (db) => {
      // Get some existing player IDs
      const existingPlayers = await db.select({ id: PublicSchema.players.id })
        .from(PublicSchema.players)
        .limit(5);

      if (existingPlayers.length === 0) {
        console.log('❌ No players found in database');
        return;
      }

      // Sample team members for team ID 1 (assuming it exists)
      const sampleMembers = existingPlayers.map((player, index) => ({
        teamId: 1,
        leagueId: 1,
        playerId: player.id,
        positionId: null,
      }));

      // Check if members already exist
      const existingMembers = await db.select()
        .from(PublicSchema.teamMembers)
        .where(eq(PublicSchema.teamMembers.teamId, 1))
        .limit(1);

      if (existingMembers.length === 0) {
        console.log('➕ Adding sample team members...');
        await db.insert(PublicSchema.teamMembers)
          .values(sampleMembers);
        
        console.log(`✅ Added ${sampleMembers.length} sample team members`);
      } else {
        console.log('ℹ️ Sample team members already exist');
      }

      // List current team members
      const allMembers = await db.select()
        .from(PublicSchema.teamMembers)
        .where(eq(PublicSchema.teamMembers.teamId, 1));

      console.log(`📋 Current team members for team 1: ${allMembers.length}`);
      allMembers.forEach(member => {
        console.log(`  - Member ${member.id}: Player ${member.playerId}, Position ${member.positionId || 'Unassigned'}`);
      });
    });
  } catch (error) {
    console.error('❌ Error adding sample team members:', error);
  }
}

addSampleTeamMembers();

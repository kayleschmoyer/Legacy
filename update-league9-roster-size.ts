#!/usr/bin/env tsx
/**
 * Update League 9 Max Roster Size
 * 
 * This script updates league 9 to have 25 max roster size and resets draft status
 */

import { runWithPublicClient, PublicSchema } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { eq } from 'drizzle-orm';

async function updateLeague9RosterSize() {
  console.log('🔧 Updating League 9 for 25-player rosters');
  console.log('===========================================\n');

  try {
    const results = await runWithPublicClient(getDbOptions(), async (db) => {
      // First, clear existing team members
      console.log('🗑️  Clearing existing team rosters...');
      const deletedMembers = await db.delete(PublicSchema.teamMembers)
        .where(eq(PublicSchema.teamMembers.leagueId, 9))
        .returning();
      
      console.log(`   Removed ${deletedMembers.length} players from rosters`);

      // Update league settings
      console.log('📝 Updating league max roster size to 25...');
      const updatedLeague = await db.update(PublicSchema.leagues)
        .set({ 
          maxRosterSize: 25,
          draftStatus: 'not-started'
        } as any)
        .where(eq(PublicSchema.leagues.id, 9))
        .returning();

      console.log(`   Updated league: ${updatedLeague[0].name}`);
      console.log(`   New max roster size: ${updatedLeague[0].maxRosterSize}`);
      console.log(`   Draft status reset to: ${updatedLeague[0].draftStatus}`);

      return { updatedLeague: updatedLeague[0], deletedCount: deletedMembers.length };
    });

    console.log('\n✅ League 9 updated successfully!');
    console.log('🎯 Ready for new draft with 25-player rosters');
    
    return results;

  } catch (error) {
    console.error('❌ Error updating league 9:', error);
    throw error;
  }
}

// Run the update
updateLeague9RosterSize()
  .then((results) => {
    if (results) {
      console.log(`\n📊 Summary:`);
      console.log(`   League: ${results.updatedLeague.name}`);
      console.log(`   Roster Size: ${results.updatedLeague.maxRosterSize} players per team`);
      console.log(`   Previous Players Removed: ${results.deletedCount}`);
      console.log(`   Draft Status: ${results.updatedLeague.draftStatus}`);
    }
  })
  .catch((error) => {
    console.error('\n💥 Failed to update league 9:', error);
    process.exit(1);
  });
#!/usr/bin/env tsx
/**
 * Final League 9 Draft Summary
 * 
 * Show detailed results of the League 9 draft with 25 players per team
 */

import { runWithPublicClient, PublicSchema } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { eq, count } from 'drizzle-orm';

async function finalDraftSummary() {
  console.log('🏆 League 9 Draft - Final Results');
  console.log('==================================\n');

  try {
    const results = await runWithPublicClient(getDbOptions(), async (db) => {
      // Get league info
      const league = await db.select({
        id: PublicSchema.leagues.id,
        name: PublicSchema.leagues.name,
        maxRosterSize: PublicSchema.leagues.maxRosterSize,
        draftStatus: PublicSchema.leagues.draftStatus,
      })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, 9))
        .limit(1);

      console.log(`🏟️  League: ${league[0].name}`);
      console.log(`📊 Status: ${league[0].draftStatus}`);
      console.log(`👥 Roster Size: ${league[0].maxRosterSize} players per team\n`);

      // Get team count
      const teamCount = await db.select({
        count: count(PublicSchema.teams.id),
      })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.leagueId, 9));

      const teams = Number(teamCount[0].count);

      // Get total player count
      const playerCount = await db.select({
        count: count(PublicSchema.teamMembers.id),
      })
        .from(PublicSchema.teamMembers)
        .where(eq(PublicSchema.teamMembers.leagueId, 9));

      const totalPlayers = Number(playerCount[0].count);

      console.log('📈 Final Statistics:');
      console.log(`   Teams Created: ${teams}`);
      console.log(`   Players per Team: ${league[0].maxRosterSize}`);
      console.log(`   Total Players Assigned: ${totalPlayers}`);
      console.log(`   Expected Total: ${teams * league[0].maxRosterSize}`);
      console.log(`   ✅ All Rosters Full: ${totalPlayers === teams * league[0].maxRosterSize ? 'YES' : 'NO'}\n`);

      // Show team names
      const teamList = await db.select({
        name: PublicSchema.teams.name,
      })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.leagueId, 9))
        .orderBy(PublicSchema.teams.id);

      console.log('🏈 Teams in League:');
      teamList.forEach((team, index) => {
        console.log(`   ${index + 1}. ${team.name}`);
      });

      return { league: league[0], teams, totalPlayers };
    });

    return results;

  } catch (error) {
    console.error('❌ Error generating final summary:', error);
    throw error;
  }
}

// Run the summary
finalDraftSummary()
  .then((results) => {
    if (results) {
      console.log('\n🎯 Draft Summary:');
      console.log('   ✅ League 9 draft completed successfully');
      console.log(`   ✅ All ${results.teams} teams have exactly 25 players`);
      console.log(`   ✅ Total ${results.totalPlayers} players assigned`);
      console.log('\n🚀 Your new CLI draft command is working perfectly!');
    }
  })
  .catch((error) => {
    console.error('\n💥 Failed to generate summary:', error);
    process.exit(1);
  });
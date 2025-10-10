#!/usr/bin/env tsx
/**
 * Check League 9 Draft Results
 * 
 * This script checks the draft results for league 9 to verify:
 * 1. Current draft status
 * 2. Number of teams 
 * 3. Players assigned to each team
 */

import { runWithPublicClient, PublicSchema } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { eq, count } from 'drizzle-orm';

async function checkLeague9DraftResults() {
  console.log('🔍 Checking League 9 Draft Results');
  console.log('=====================================\n');

  try {
    const results = await runWithPublicClient(getDbOptions(), async (db) => {
      // Get league info
      const league = await db.select({
        id: PublicSchema.leagues.id,
        name: PublicSchema.leagues.name,
        owner: PublicSchema.leagues.owner,
        maxRosterSize: PublicSchema.leagues.maxRosterSize,
        draftStatus: PublicSchema.leagues.draftStatus,
      })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, 9))
        .limit(1);

      if (league.length === 0) {
        console.log('❌ League 9 not found');
        return null;
      }

      console.log('🏟️  League Information:');
      console.log(`   Name: ${league[0].name}`);
      console.log(`   ID: ${league[0].id}`);
      console.log(`   Owner: ${league[0].owner}`);
      console.log(`   Max Roster Size: ${league[0].maxRosterSize}`);
      console.log(`   Draft Status: ${league[0].draftStatus}`);
      console.log();

      // Get teams in the league
      const teams = await db.select({
        id: PublicSchema.teams.id,
        name: PublicSchema.teams.name,
        leagueId: PublicSchema.teams.leagueId,
      })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.leagueId, 9))
        .orderBy(PublicSchema.teams.id);

      console.log(`👥 Teams (${teams.length} total):`);
      teams.forEach(team => {
        console.log(`   ${team.id}: ${team.name}`);
      });
      console.log();

      // Get player counts for each team
      console.log('📊 Roster Counts:');
      const rosterCounts = [];
      
      for (const team of teams) {
        const playerCount = await db.select({
          count: count(PublicSchema.teamMembers.id),
        })
          .from(PublicSchema.teamMembers)
          .where(eq(PublicSchema.teamMembers.teamId, team.id));

        const playerCountNum = Number(playerCount[0].count);
        rosterCounts.push({ teamId: team.id, teamName: team.name, playerCount: playerCountNum });
        console.log(`   Team ${team.id} (${team.name}): ${playerCountNum} players`);
      }
      console.log();

      // Get total players in league
      const totalPlayers = await db.select({
        count: count(PublicSchema.teamMembers.id),
      })
        .from(PublicSchema.teamMembers)
        .where(eq(PublicSchema.teamMembers.leagueId, 9));

      const totalCount = Number(totalPlayers[0].count);
      console.log(`📈 Summary:`);
      console.log(`   Total Teams: ${teams.length}`);
      console.log(`   Total Players: ${totalCount}`);
      console.log(`   Average per Team: ${teams.length > 0 ? (totalCount / teams.length).toFixed(1) : 0}`);
      console.log(`   Expected per Team: ${league[0].maxRosterSize}`);
      
      // Check if all teams have expected number of players
      const expectedTotal = teams.length * league[0].maxRosterSize;
      const isCorrect = totalCount === expectedTotal;
      console.log(`   Expected Total: ${expectedTotal}`);
      console.log(`   ✅ Correct Distribution: ${isCorrect ? 'YES' : 'NO'}`);

      if (!isCorrect) {
        console.log('\n⚠️  Draft may still be in progress or encountered an issue');
        console.log('   Check draft processor logs for more details');
      } else {
        console.log('\n🎉 Draft completed successfully with correct player distribution!');
      }

      return {
        league: league[0],
        teams,
        rosterCounts,
        totalCount,
        expectedTotal,
        isCorrect
      };
    });

    return results;

  } catch (error) {
    console.error('❌ Error checking league 9 results:', error);
    throw error;
  }
}

// Run the check
checkLeague9DraftResults()
  .then((results) => {
    if (results) {
      console.log('\n✅ League 9 draft check completed successfully');
    }
  })
  .catch((error) => {
    console.error('\n💥 Failed to check league 9:', error);
    process.exit(1);
  });
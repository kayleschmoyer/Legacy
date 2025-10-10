/**
 * Quick verification script to check team assignments after draft
 * This will connect directly to the database and verify the draft results
 */

import { eq, sql } from 'drizzle-orm';
import { runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import * as PublicSchema from '@legacy-sports/db-client/drizzle/public';

async function verifyTeamAssignments(leagueId: number) {
  console.log(`🔍 Verifying team assignments for league ${leagueId}...`);
  
  await runWithPublicClient(getDbOptions(), async (db) => {
    
    // Check teams and their player counts
    const teamSummary = await db.select({
      teamId: PublicSchema.teams.id,
      teamName: PublicSchema.teams.name,
      playerCount: sql<number>`COUNT(${PublicSchema.teamMembers.id})::int`,
    })
    .from(PublicSchema.teams)
    .leftJoin(PublicSchema.teamMembers, eq(PublicSchema.teams.id, PublicSchema.teamMembers.teamId))
    .where(eq(PublicSchema.teams.leagueId, leagueId))
    .groupBy(PublicSchema.teams.id, PublicSchema.teams.name)
    .orderBy(PublicSchema.teams.name);

    console.log('\n📊 Team Summary:');
    console.log('================');
    let totalAssignments = 0;
    teamSummary.forEach(team => {
      console.log(`${team.teamName}: ${team.playerCount} players`);
      totalAssignments += team.playerCount;
    });
    console.log(`\nTotal assignments across all teams: ${totalAssignments}`);

    // Check some sample assignments
    const sampleAssignments = await db.select({
      teamName: PublicSchema.teams.name,
      playerName: sql<string>`${PublicSchema.players.firstName} || ' ' || ${PublicSchema.players.lastName}`,
      positionType: PublicSchema.leaguePosition.positionType,
    })
    .from(PublicSchema.teamMembers)
    .innerJoin(PublicSchema.teams, eq(PublicSchema.teamMembers.teamId, PublicSchema.teams.id))
    .innerJoin(PublicSchema.players, eq(PublicSchema.teamMembers.playerId, PublicSchema.players.id))
    .innerJoin(PublicSchema.leaguePosition, eq(PublicSchema.teamMembers.positionId, PublicSchema.leaguePosition.id))
    .where(eq(PublicSchema.teams.leagueId, leagueId))
    .orderBy(PublicSchema.teams.name, PublicSchema.leaguePosition.positionType)
    .limit(20);

    console.log('\n👥 Sample Player Assignments:');
    console.log('=============================');
    sampleAssignments.forEach(assignment => {
      console.log(`${assignment.teamName}: ${assignment.playerName} (${assignment.positionType})`);
    });

    // Check league status
    const leagueInfo = await db.select({
      name: PublicSchema.leagues.name,
      draftStatus: PublicSchema.leagues.draftStatus,
    })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId));

    if (leagueInfo.length > 0) {
      console.log('\n🏆 League Status:');
      console.log('=================');
      console.log(`League: ${leagueInfo[0].name}`);
      console.log(`Draft Status: ${leagueInfo[0].draftStatus}`);
    }

    return {
      totalTeams: teamSummary.length,
      totalAssignments,
      avgPlayersPerTeam: teamSummary.length > 0 ? totalAssignments / teamSummary.length : 0,
      draftStatus: leagueInfo[0]?.draftStatus
    };
  });
}

// Run verification for league 5
verifyTeamAssignments(5)
  .then((results) => {
    console.log('\n✅ Verification completed successfully!');
    console.log(`Summary: ${results.totalTeams} teams, ${results.totalAssignments} assignments, ${results.avgPlayersPerTeam.toFixed(1)} avg players per team`);
  })
  .catch((error) => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });

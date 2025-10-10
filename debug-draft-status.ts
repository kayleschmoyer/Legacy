/**
 * Debug script to investigate draft status inconsistency
 * 
 * This script will help identify:
 * 1. Current draft status in database
 * 2. Whether SQS messages were sent/processed
 * 3. Team roster assignments
 * 4. Potential reasons for the mismatch
 */

import { eq } from 'drizzle-orm';
import { runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import * as PublicSchema from '@legacy-sports/db-client/drizzle/public';

interface DebugResults {
  leagueInfo: any;
  teams: any[];
  teamMembers: any[];
  leaguePositions: any[];
  draftIssues: string[];
}

async function debugDraftStatus(leagueId: number): Promise<DebugResults> {
  console.log(`🔍 Starting draft status debug for league ${leagueId}...`);
  
  const results: DebugResults = {
    leagueInfo: null,
    teams: [],
    teamMembers: [],
    leaguePositions: [],
    draftIssues: []
  };

  await runWithPublicClient(getDbOptions(), async (db) => {
    
    // 1. Get league information
    console.log('📋 Fetching league information...');
    const leagueData = await db.select({
      id: PublicSchema.leagues.id,
      name: PublicSchema.leagues.name,
      owner: PublicSchema.leagues.owner,
      draftStatus: PublicSchema.leagues.draftStatus,
      maxRosterSize: PublicSchema.leagues.maxRosterSize,
      currentMatchup: PublicSchema.leagues.currentMatchup,
    }).from(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId));
    
    if (leagueData.length === 0) {
      results.draftIssues.push(`❌ League ${leagueId} not found`);
      return;
    }
    
    results.leagueInfo = leagueData[0];
    console.log(`✅ League found:`, results.leagueInfo);

    // 2. Get teams for this league
    console.log('🏈 Fetching teams...');
    results.teams = await db.select({
      id: PublicSchema.teams.id,
      name: PublicSchema.teams.name,
      leagueId: PublicSchema.teams.leagueId,
    }).from(PublicSchema.teams)
      .where(eq(PublicSchema.teams.leagueId, leagueId));
    
    console.log(`✅ Found ${results.teams.length} teams:`, results.teams);
    
    if (results.teams.length === 0) {
      results.draftIssues.push(`❌ No teams found for league ${leagueId}`);
    }

    // 3. Get team members (player assignments)
    console.log('👥 Fetching team members...');
    const teamIds = results.teams.map(t => t.id);
    
    if (teamIds.length > 0) {
      results.teamMembers = await db.select({
        id: PublicSchema.teamMembers.id,
        teamId: PublicSchema.teamMembers.teamId,
        playerId: PublicSchema.teamMembers.playerId,
        positionId: PublicSchema.teamMembers.positionId,
        // Join player info
        playerFirstName: PublicSchema.players.firstName,
        playerLastName: PublicSchema.players.lastName,
      }).from(PublicSchema.teamMembers)
        .innerJoin(PublicSchema.players, eq(PublicSchema.teamMembers.playerId, PublicSchema.players.id))
        .where(PublicSchema.teamMembers.teamId.in(teamIds));
      
      console.log(`✅ Found ${results.teamMembers.length} team members`);
      
      // Count assignments per team
      const assignmentsByTeam = results.teamMembers.reduce((acc, member) => {
        acc[member.teamId] = (acc[member.teamId] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
      
      console.log('📊 Player assignments per team:', assignmentsByTeam);
    } else {
      results.draftIssues.push(`❌ No teams to check for assignments`);
    }

    // 4. Get league positions
    console.log('📍 Fetching league positions...');
    results.leaguePositions = await db.select({
      id: PublicSchema.leaguePosition.id,
      leagueId: PublicSchema.leaguePosition.leagueId,
      positionType: PublicSchema.leaguePosition.positionType,
    }).from(PublicSchema.leaguePosition)
      .where(eq(PublicSchema.leaguePosition.leagueId, leagueId));
    
    console.log(`✅ Found ${results.leaguePositions.length} league positions:`, 
      results.leaguePositions.map(p => p.positionType));
    
    if (results.leaguePositions.length === 0) {
      results.draftIssues.push(`❌ No league positions configured for league ${leagueId}`);
    }

    // 5. Analyze draft issues
    console.log('🔬 Analyzing potential issues...');
    
    if (results.leagueInfo.draftStatus === 'completed') {
      if (results.teamMembers.length === 0) {
        results.draftIssues.push(`🚨 CRITICAL: Draft marked as 'completed' but no players assigned to any teams!`);
      }
      
      const expectedAssignments = results.teams.length * results.leaguePositions.length;
      if (results.teamMembers.length < expectedAssignments) {
        results.draftIssues.push(
          `⚠️ Incomplete assignments: Expected ${expectedAssignments} (${results.teams.length} teams × ${results.leaguePositions.length} positions), ` +
          `but only found ${results.teamMembers.length} assignments`
        );
      }
    } else if (results.leagueInfo.draftStatus === 'queued') {
      results.draftIssues.push(`⏳ Draft is stuck in 'queued' status - SQS message may not have been processed`);
    } else if (results.leagueInfo.draftStatus === 'in-progress') {
      results.draftIssues.push(`⏳ Draft is stuck in 'in-progress' status - draft processor may have failed`);
    }
    
    if (results.teams.length === 0) {
      results.draftIssues.push(`❌ Cannot run draft without teams`);
    }
    
    if (results.leaguePositions.length === 0) {
      results.draftIssues.push(`❌ Cannot run draft without league positions configured`);
    }

    console.log('🎯 Analysis complete!');
  });

  return results;
}

// Example usage for debugging a specific league
async function main() {
  const leagueIdToDebug = process.env.DEBUG_LEAGUE_ID ? parseInt(process.env.DEBUG_LEAGUE_ID) : 1;
  
  try {
    console.log(`🚀 Starting draft debug for league ${leagueIdToDebug}...`);
    
    const results = await debugDraftStatus(leagueIdToDebug);
    
    console.log('\n📊 === DRAFT DEBUG SUMMARY ===');
    console.log(`League: ${results.leagueInfo?.name} (ID: ${results.leagueInfo?.id})`);
    console.log(`Draft Status: ${results.leagueInfo?.draftStatus}`);
    console.log(`Teams: ${results.teams.length}`);
    console.log(`League Positions: ${results.leaguePositions.length}`);
    console.log(`Team Members Assigned: ${results.teamMembers.length}`);
    
    if (results.draftIssues.length > 0) {
      console.log('\n🚨 === IDENTIFIED ISSUES ===');
      results.draftIssues.forEach(issue => console.log(issue));
    } else {
      console.log('\n✅ No issues detected');
    }
    
    // Show detailed breakdown by team
    if (results.teamMembers.length > 0) {
      console.log('\n👥 === TEAM ASSIGNMENTS ===');
      const membersByTeam = results.teamMembers.reduce((acc, member) => {
        if (!acc[member.teamId]) acc[member.teamId] = [];
        acc[member.teamId].push(member);
        return acc;
      }, {} as Record<number, typeof results.teamMembers>);
      
      results.teams.forEach(team => {
        const members = membersByTeam[team.id] || [];
        console.log(`${team.name} (ID: ${team.id}): ${members.length} players`);
        members.forEach(member => {
          console.log(`  - ${member.playerFirstName} ${member.playerLastName} (Position: ${member.positionId || 'UNASSIGNED'})`);
        });
      });
    }
    
  } catch (error) {
    console.error('❌ Error during draft debug:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
  }
}

// Environment check and recommendation
console.log('\n🔧 === ENVIRONMENT CHECK ===');
console.log(`SQS_AUTOMATIC_DRAFTS_URL: ${process.env.SQS_AUTOMATIC_DRAFTS_URL ? '✅ SET' : '❌ NOT SET'}`);
console.log(`SENTRY_DSN: ${process.env.SENTRY_DSN ? '✅ SET' : '❌ NOT SET'}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);

if (!process.env.SQS_AUTOMATIC_DRAFTS_URL) {
  console.log('\n⚠️ RECOMMENDATION: SQS_AUTOMATIC_DRAFTS_URL is not set.');
  console.log('   This will prevent the startDraft mutation from working.');
  console.log('   In production, this should be configured in Terraform.');
  console.log('   For local testing, you may want to add a bypass or mock implementation.');
}

// Only run main if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { debugDraftStatus, DebugResults };

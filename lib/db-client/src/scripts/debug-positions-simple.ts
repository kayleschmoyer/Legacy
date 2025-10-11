#!/usr/bin/env tsx

/**
 * Debug Players Without Positions
 * 
 * This script analyzes why some players have no eligible positions
 */

import { config } from 'dotenv';
import { Pool } from 'pg';
import { resolve } from 'path';
import { 
  extractSingleTypedResult,
  extractTypedResults,
  isCountResult,
  isPlayerWithPositionStatsResult
} from '../types/RawSqlTypes';

// Simple interfaces for the specific stat queries in this debug script
interface SimpleFieldingStats {
  pos: string;
  g: number;
}

interface SimplePitchingStats {
  g: number;
  gs: number;
}

interface SimpleBattingStats {
  g: number;
  ab: number;
  h: number;
}

interface PlayerGamesDistribution {
  id: number;
  first_name: string;
  last_name: string;
  max_fielding_games: number;
  pitching_games: number;
  pitching_starts: number;
  batting_games: number;
}

interface LowGameCountPlayer {
  id: number;
  first_name: string;
  last_name: string;
  max_fielding_games: number;
  pitching_games: number;
  pitching_starts: number;
}

// Type guards for the simple stat interfaces
function isSimpleFieldingStats(obj: unknown): obj is SimpleFieldingStats {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'pos' in obj &&
    'g' in obj &&
    typeof (obj as SimpleFieldingStats).pos === 'string' &&
    typeof (obj as SimpleFieldingStats).g === 'number'
  );
}

function isSimplePitchingStats(obj: unknown): obj is SimplePitchingStats {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'g' in obj &&
    'gs' in obj &&
    typeof (obj as SimplePitchingStats).g === 'number' &&
    typeof (obj as SimplePitchingStats).gs === 'number'
  );
}

function isSimpleBattingStats(obj: unknown): obj is SimpleBattingStats {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'g' in obj &&
    'ab' in obj &&
    'h' in obj &&
    typeof (obj as SimpleBattingStats).g === 'number' &&
    typeof (obj as SimpleBattingStats).ab === 'number' &&
    typeof (obj as SimpleBattingStats).h === 'number'
  );
}

function isPlayerGamesDistribution(obj: unknown): obj is PlayerGamesDistribution {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'first_name' in obj &&
    'last_name' in obj &&
    'max_fielding_games' in obj &&
    'pitching_games' in obj &&
    'pitching_starts' in obj &&
    'batting_games' in obj &&
    typeof (obj as PlayerGamesDistribution).id === 'number' &&
    typeof (obj as PlayerGamesDistribution).first_name === 'string' &&
    typeof (obj as PlayerGamesDistribution).last_name === 'string' &&
    typeof (obj as PlayerGamesDistribution).max_fielding_games === 'number' &&
    typeof (obj as PlayerGamesDistribution).pitching_games === 'number' &&
    typeof (obj as PlayerGamesDistribution).pitching_starts === 'number' &&
    typeof (obj as PlayerGamesDistribution).batting_games === 'number'
  );
}

function isLowGameCountPlayer(obj: unknown): obj is LowGameCountPlayer {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'first_name' in obj &&
    'last_name' in obj &&
    'max_fielding_games' in obj &&
    'pitching_games' in obj &&
    'pitching_starts' in obj &&
    typeof (obj as LowGameCountPlayer).id === 'number' &&
    typeof (obj as LowGameCountPlayer).first_name === 'string' &&
    typeof (obj as LowGameCountPlayer).last_name === 'string' &&
    typeof (obj as LowGameCountPlayer).max_fielding_games === 'number' &&
    typeof (obj as LowGameCountPlayer).pitching_games === 'number' &&
    typeof (obj as LowGameCountPlayer).pitching_starts === 'number'
  );
}

// Load .env from the project root
config({ path: resolve(__dirname, '../../../../.env') });

async function debugPlayersWithoutPositions() {
  console.log('🔍 Debugging players without positions...\n');
  
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'legacy_sports_dev',
  });
  
  try {
    // 1. Get total number of players
    const totalPlayersResult = await pool.query('SELECT COUNT(*) as count FROM players');
    const totalPlayersCount = extractSingleTypedResult(totalPlayersResult, isCountResult);
    const totalPlayers = totalPlayersCount ? totalPlayersCount.count : 0;
    
    console.log(`📊 Total players in database: ${totalPlayers}`);
    
    // 2. Get players with positions
    const playersWithPositionsResult = await pool.query('SELECT COUNT(DISTINCT player_id) as count FROM player_eligible_positions');
    const playersWithPositionsCount = extractSingleTypedResult(playersWithPositionsResult, isCountResult);
    const playersWithPositions = playersWithPositionsCount ? playersWithPositionsCount.count : 0;
    
    console.log(`✅ Players with eligible positions: ${playersWithPositions}`);
    console.log(`❌ Players WITHOUT positions: ${totalPlayers - playersWithPositions}\n`);
    
    // 3. Find specific players without positions (sample of first 20)
    const playersWithoutPositionsQuery = `
      SELECT p.id, p.first_name, p.last_name, p.bref_id 
      FROM players p 
      LEFT JOIN player_eligible_positions pep ON p.id = pep.player_id 
      WHERE pep.player_id IS NULL 
      LIMIT 20
    `;
    
    const playersWithoutPositionsResult = await pool.query(playersWithoutPositionsQuery);
    const playersWithoutPositions = extractTypedResults(playersWithoutPositionsResult, isPlayerWithPositionStatsResult);
    
    console.log('🚫 Sample of players WITHOUT positions:');
    console.log('ID\tName\t\t\tBRef ID');
    console.log('----------------------------------------');
    playersWithoutPositions.forEach((player) => {
      const fullName = `${player.first_name} ${player.last_name}`.padEnd(20, ' ');
      console.log(`${player.id}\t${fullName}\t${player.bref_id}`);
    });
    
    if (playersWithoutPositions.length > 0) {
      // 4. Check stats for a sample player to understand why they don't have positions
      const samplePlayer = playersWithoutPositions[0];
      console.log(`\n🔬 Analyzing sample player: ${samplePlayer.first_name} ${samplePlayer.last_name} (ID: ${samplePlayer.id})`);
      
      // Check career fielding stats
      const fieldingStatsQuery = `
        SELECT pos, g 
        FROM career_fielding 
        WHERE player_id = $1
      `;
      const fieldingStatsResult = await pool.query(fieldingStatsQuery, [samplePlayer.id]);
      
      const fieldingStats = extractTypedResults(fieldingStatsResult, isSimpleFieldingStats);
      
      console.log('📈 Career fielding stats:');
      if (fieldingStats.length === 0) {
        console.log('  - No fielding stats found');
      } else {
        fieldingStats.forEach((stat) => {
          console.log(`  - Position: ${stat.pos}, Games: ${stat.g}`);
        });
      }
      
      // Check career pitching stats
      const pitchingStatsQuery = `
        SELECT g, gs 
        FROM career_pitching 
        WHERE player_id = $1
      `;
      const pitchingStatsResult = await pool.query(pitchingStatsQuery, [samplePlayer.id]);
      
      const pitchingStats = extractTypedResults(pitchingStatsResult, isSimplePitchingStats);
      
      console.log('⚾ Career pitching stats:');
      if (pitchingStats.length === 0) {
        console.log('  - No pitching stats found');
      } else {
        pitchingStats.forEach((stat) => {
          const reliefApps = stat.g - stat.gs;
          console.log(`  - Games: ${stat.g}, Games Started: ${stat.gs}, Relief Apps: ${reliefApps}`);
        });
      }
      
      // Check career batting stats
      const battingStatsQuery = `
        SELECT g, ab, h 
        FROM career_batting 
        WHERE player_id = $1
      `;
      const battingStatsResult = await pool.query(battingStatsQuery, [samplePlayer.id]);
      
      const battingStats = extractTypedResults(battingStatsResult, isSimpleBattingStats);
      
      console.log('🏏 Career batting stats:');
      if (battingStats.length === 0) {
        console.log('  - No batting stats found');
      } else {
        battingStats.forEach((stat) => {
          console.log(`  - Games: ${stat.g}, At Bats: ${stat.ab}, Hits: ${stat.h}`);
        });
      }
    }
    
    // 5. Check the eligibility criteria breakdown
    console.log('\n📋 Position eligibility criteria analysis:');
    
    // Players eligible for field positions (50+ games, not pitcher)
    const fieldingEligibleQuery = `
      SELECT COUNT(DISTINCT player_id) as count 
      FROM career_fielding_by_position 
      WHERE g > 50 AND pos != 'P'
    `;
    const fieldingEligibleResult = await pool.query(fieldingEligibleQuery);
    const fieldingEligibleCount = extractSingleTypedResult(fieldingEligibleResult, isCountResult);
    
    console.log(`⚾ Fielding positions (50+ games, not P): ${fieldingEligibleCount ? fieldingEligibleCount.count : 0} players`);
    
    // Players eligible for SP (50+ games started)
    const spEligibleQuery = `
      SELECT COUNT(*) as count 
      FROM career_pitching 
      WHERE gs > 50
    `;
    const spEligibleResult = await pool.query(spEligibleQuery);
    const spEligibleCount = extractSingleTypedResult(spEligibleResult, isCountResult);
    
    console.log(`🏈 Starting Pitcher (50+ GS): ${spEligibleCount ? spEligibleCount.count : 0} players`);
    
    // Players eligible for RP (50+ relief appearances)
    const rpEligibleQuery = `
      SELECT COUNT(*) as count 
      FROM career_pitching 
      WHERE g - gs > 50
    `;
    const rpEligibleResult = await pool.query(rpEligibleQuery);
    const rpEligibleCount = extractSingleTypedResult(rpEligibleResult, isCountResult);
    
    console.log(`🏈 Relief Pitcher (50+ relief apps): ${rpEligibleCount ? rpEligibleCount.count : 0} players`);
    
    // 6. Show distribution of games played for players without positions
    console.log('\n📊 Games played distribution for players without positions:');
    
    const gamesDistributionQuery = `
      SELECT 
        p.id,
        p.first_name,
        p.last_name,
        COALESCE(MAX(cf.g), 0) as max_fielding_games,
        COALESCE(cp.g, 0) as pitching_games,
        COALESCE(cp.gs, 0) as pitching_starts,
        COALESCE(cb.g, 0) as batting_games
      FROM players p
      LEFT JOIN career_fielding cf ON cf.player_id = p.id
      LEFT JOIN career_pitching cp ON cp.player_id = p.id
      LEFT JOIN career_batting cb ON cb.player_id = p.id
      LEFT JOIN player_eligible_positions pep ON pep.player_id = p.id
      WHERE pep.player_id IS NULL
      GROUP BY p.id, p.first_name, p.last_name, cp.g, cp.gs, cb.g
      ORDER BY MAX(cf.g) DESC NULLS LAST
      LIMIT 10
    `;
    
    const gamesDistributionResult = await pool.query(gamesDistributionQuery);
    const gamesDistribution = extractTypedResults(gamesDistributionResult, isPlayerGamesDistribution);
    
    console.log('Player\t\t\tMax Field Games\tPitch Games\tPitch Starts\tBat Games');
    console.log('---------------------------------------------------------------------------------');
    gamesDistribution.forEach((player) => {
      const name = `${player.first_name} ${player.last_name}`.padEnd(20, ' ');
      console.log(`${name}\t${player.max_fielding_games}\t\t${player.pitching_games}\t\t${player.pitching_starts}\t\t${player.batting_games}`);
    });
    
    // 7. Show the actual eligibility criteria from the view
    console.log('\n📜 Player Eligible Positions View Definition:');
    console.log('This view determines eligibility using these criteria:');
    console.log('1. Field positions: 50+ games at position (excluding pitcher)');
    console.log('2. Starting pitcher (SP): 50+ games started');  
    console.log('3. Relief pitcher (RP): 50+ relief appearances (games - games_started > 50)');
    
    // 8. Show players with low game counts
    console.log('\n🎯 Players with low game counts (potential reason for no positions):');
    
    const lowGameCountQuery = `
      SELECT 
        p.id,
        p.first_name,
        p.last_name,
        COALESCE(MAX(cf.g), 0) as max_fielding_games,
        COALESCE(cp.g, 0) as pitching_games,
        COALESCE(cp.gs, 0) as pitching_starts
      FROM players p
      LEFT JOIN career_fielding cf ON cf.player_id = p.id
      LEFT JOIN career_pitching cp ON cp.player_id = p.id
      LEFT JOIN player_eligible_positions pep ON pep.player_id = p.id
      WHERE pep.player_id IS NULL
      AND (
        (COALESCE(MAX(cf.g), 0) > 0 AND COALESCE(MAX(cf.g), 0) <= 50) OR
        (COALESCE(cp.g, 0) > 0 AND COALESCE(cp.gs, 0) <= 50 AND (COALESCE(cp.g, 0) - COALESCE(cp.gs, 0)) <= 50)
      )
      GROUP BY p.id, p.first_name, p.last_name, cp.g, cp.gs
      ORDER BY MAX(cf.g) DESC NULLS LAST
      LIMIT 15
    `;
    
    const lowGameCountResult = await pool.query(lowGameCountQuery);
    const lowGameCountPlayers = extractTypedResults(lowGameCountResult, isLowGameCountPlayer);
    
    console.log('Player\t\t\tMax Field Games\tPitch Games\tPitch Starts\tRelief Apps');
    console.log('---------------------------------------------------------------------------------');
    lowGameCountPlayers.forEach((player) => {
      const name = `${player.first_name} ${player.last_name}`.padEnd(20, ' ');
      const reliefApps = player.pitching_games - player.pitching_starts;
      console.log(`${name}\t${player.max_fielding_games}\t\t${player.pitching_games}\t\t${player.pitching_starts}\t\t${reliefApps}`);
    });
    
  } catch (error) {
    console.error('❌ Error analyzing players without positions:', error);
  } finally {
    await pool.end();
  }
}

// Run the analysis
debugPlayersWithoutPositions()
  .then(() => {
    console.log('\n✅ Analysis complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });

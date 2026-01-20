#!/usr/bin/env node
/**
 * Check if we have enough players with stats for each position to fill a draft
 */

import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { sql } from 'drizzle-orm';

interface PositionCount {
  position: string;
  playerCount: number;
}

// Default roster positions for leagues (from lambdas/db/src/schema/leagues.ts)
const ROSTER_REQUIREMENTS = {
  C: 1, // Catcher
  '1B': 1, // First Base
  '2B': 1, // Second Base
  '3B': 1, // Third Base
  SS: 1, // Shortstop
  OF: 3, // Outfield (3 slots)
  DH: 1, // Designated Hitter
  SP: 4, // Starting Pitcher (4 slots)
  RP: 4, // Relief Pitcher (4 slots)
  IF: 1, // Infield utility
  XDH: 1, // Extra DH/utility
} as const;

// Position mapping - how career_fielding.position maps to roster positions
const POSITION_MAPPING: Record<string, string[]> = {
  C: ['C'],
  '1B': ['1B', 'IF'],
  '2B': ['2B', 'IF'],
  '3B': ['3B', 'IF'],
  SS: ['SS', 'IF'],
  LF: ['OF'],
  CF: ['OF'],
  RF: ['OF'],
  OF: ['OF'],
  DH: ['DH', 'XDH'],
  P: ['SP', 'RP'], // Generic pitcher
  SP: ['SP'],
  RP: ['RP'],
};

async function main() {
  const NUM_TEAMS = 10; // Standard league size

  console.log('🔍 Checking draft position availability...\n');
  console.log(`League Configuration: ${NUM_TEAMS} teams\n`);

  try {
    await runWithPublicClient(getDbOptions(), async (db) => {
      // Get all players with stats and their positions
      const positionsQuery = await db.execute<PositionCount>(sql`
        SELECT 
          cf.position,
          COUNT(DISTINCT cf.player_id) as "playerCount"
        FROM career_fielding cf
        INNER JOIN players p ON cf.player_id = p.id
        WHERE p.stats_last_fetched_at IS NOT NULL
        GROUP BY cf.position
        ORDER BY cf.position
      `);

      const positionCounts = new Map<string, number>();

      // Initialize all positions with 0
      Object.keys(ROSTER_REQUIREMENTS).forEach((pos) => {
        positionCounts.set(pos, 0);
      });

      // Map career_fielding positions to roster positions
      for (const row of positionsQuery.rows) {
        const careerPosition = row.position;
        const count = Number(row.playerCount);
        const mappedPositions = POSITION_MAPPING[careerPosition] || [];

        for (const rosterPosition of mappedPositions) {
          const current = positionCounts.get(rosterPosition) || 0;
          positionCounts.set(rosterPosition, current + count);
        }
      }

      // Also count players who can play DH (anyone with any position)
      const totalFielders = await db.execute(sql`
        SELECT COUNT(DISTINCT cf.player_id) as total
        FROM career_fielding cf
        INNER JOIN players p ON cf.player_id = p.id
        WHERE p.stats_last_fetched_at IS NOT NULL
          AND cf.position NOT IN ('P', 'SP', 'RP')
      `);

      const dhEligibleCount = Number(totalFielders.rows[0]?.total || 0);
      positionCounts.set('DH', dhEligibleCount);
      positionCounts.set('XDH', dhEligibleCount);

      console.log('📊 Position Availability Analysis\n');
      console.log('Position | Need | Available | Status');
      console.log('---------|------|-----------|--------');

      let hasShortage = false;

      for (const [position, required] of Object.entries(ROSTER_REQUIREMENTS)) {
        const needed = required * NUM_TEAMS;
        const available = positionCounts.get(position) || 0;
        const status = available >= needed ? '✅ OK' : '❌ SHORT';
        const shortage = Math.max(0, needed - available);

        if (available < needed) {
          hasShortage = true;
          console.log(
            `${position.padEnd(8)} | ${needed.toString().padStart(4)} | ${available.toString().padStart(9)} | ${status} (short ${shortage})`,
          );
        } else {
          console.log(
            `${position.padEnd(8)} | ${needed.toString().padStart(4)} | ${available.toString().padStart(9)} | ${status}`,
          );
        }
      }

      console.log('\n');

      if (hasShortage) {
        console.log('⚠️  WARNING: Not enough players at some positions!');
        console.log(
          '   Draft may include players without stats to fill these positions.\n',
        );
      } else {
        console.log('✅ SUCCESS: Enough players at all positions!');
        console.log(
          '   Draft can be filled entirely with players who have stats.\n',
        );
      }

      // Show raw career_fielding position counts
      console.log('📋 Raw Position Counts (from career_fielding):\n');
      for (const row of positionsQuery.rows) {
        console.log(`   ${row.position}: ${row.playerCount} players`);
      }
    });
  } catch (error) {
    console.error('💥 Error:', error);
    process.exit(1);
  }
}

main();

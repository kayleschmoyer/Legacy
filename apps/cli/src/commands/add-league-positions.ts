#!/usr/bin/env node

import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { eq } from 'drizzle-orm';

// Position types that match the database schema
type PositionType =
  | 'C'
  | '1B'
  | '2B'
  | '3B'
  | 'SS'
  | 'OF'
  | 'DH'
  | 'SP'
  | 'RP'
  | 'IF'
  | 'XDH'
  | 'RF'
  | 'LF'
  | 'CF';

// Default roster positions for leagues
const DEFAULT_ROSTER_POSITIONS: PositionType[] = [
  // Batting positions
  'C', // Catcher
  '1B', // First Base
  '2B', // Second Base
  '3B', // Third Base
  'SS', // Shortstop
  'OF', // Outfield (3 slots)
  'OF',
  'OF',
  'DH', // Designated Hitter
  // Pitching positions
  'SP', // Starting Pitcher (5 slots)
  'SP',
  'SP',
  'SP',
  'SP',
  'RP', // Relief Pitcher (3 slots)
  'RP',
  'RP',
  // Utility positions
  'IF', // Infield utility
  'XDH', // Extra DH/utility
] as const;

/**
 * Add missing positions to existing leagues
 */
async function main() {
  try {
    console.log('🔧 Legacy Sports - Adding Missing League Positions');
    console.log('===================================================\n');

    await runWithPublicClient(getDbOptions(), async (db) => {
      // Get all leagues
      const leagues = await db.select().from(PublicSchema.leagues);
      console.log(`📋 Found ${leagues.length} leagues to check\n`);

      let leaguesUpdated = 0;

      for (const league of leagues) {
        console.log(`🏆 Checking league ${league.id}: "${league.name}"`);

        // Check if league has positions
        const existingPositions = await db
          .select()
          .from(PublicSchema.leaguePosition)
          .where(eq(PublicSchema.leaguePosition.leagueId, league.id));

        if (existingPositions.length === 0) {
          console.log(`   ❌ No positions found. Adding default positions...`);

          // Create position data
          const positionData = DEFAULT_ROSTER_POSITIONS.map((positionType) => ({
            leagueId: league.id,
            positionType: positionType,
          }));

          // Insert positions
          await db.insert(PublicSchema.leaguePosition).values(positionData);

          console.log(
            `   ✅ Added ${DEFAULT_ROSTER_POSITIONS.length} positions`,
          );
          leaguesUpdated++;
        } else {
          console.log(
            `   ✅ Already has ${existingPositions.length} positions`,
          );
        }
      }

      console.log(
        `\n🎉 Complete! Updated ${leaguesUpdated} leagues with positions.`,
      );

      if (leaguesUpdated > 0) {
        console.log('\nYour roster management should now show position slots!');
      }
    });
  } catch (error) {
    console.error('💥 Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}

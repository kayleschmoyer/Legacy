#!/usr/bin/env node
/**
 * Test Baseball Reference scraper locally
 * Usage: pnpm exec nx run cli:test-bref-scraper -- --brefId abbotje01 --season 2001 --gameNum 22
 */

import {
  getGameBattingStats,
  getGameFieldingStats,
  getGamePitchingStats,
} from '@legacy-sports/bref-client';
import type { Player } from '@legacy-sports/db-client';
import { Command } from 'commander';

interface TestOptions {
  brefId: string;
  season: string;
  gameNum: string;
  statType?: 'batting' | 'pitching' | 'fielding' | 'all';
}

async function main() {
  const program = new Command();

  program
    .name('test-bref-scraper')
    .description('Test Baseball Reference scraper locally')
    .requiredOption(
      '--brefId <string>',
      'Baseball Reference player ID (e.g., abbotje01)',
    )
    .requiredOption('--season <number>', 'Season year (e.g., 2001)')
    .requiredOption('--gameNum <number>', 'Game number (e.g., 22)')
    .option(
      '--statType <type>',
      'Stat type to test: batting, pitching, fielding, or all',
      'all',
    )
    .parse(process.argv);

  const options = program.opts<TestOptions>();

  const player: Player = {
    id: 999, // Dummy ID for testing
    brefId: options.brefId,
    firstName: 'Test',
    lastName: 'Player',
    mlbPlayerId: null,
    statsLastFetchedAt: null,
    allStarSelections: 0,
    goldGloves: 0,
    silverSluggers: 0,
    mvpAwards: 0,
    cyYoungAwards: 0,
    worldSeriesRings: 0,
    hallOfFame: false,
    rookieOfTheYear: false,
    totalGames: 0,
    batHand: null,
    throwHand: null,
    sport: 'baseball',
    pfrId: null,
    isDst: false,
    nflTeam: null,
    position: null,
  };

  const season = parseInt(options.season, 10);
  const gameNum = parseInt(options.gameNum, 10);
  const statType = options.statType || 'all';

  console.log('\n🔍 Testing Baseball Reference Scraper');
  console.log('=====================================');
  console.log(`Player: ${options.brefId}`);
  console.log(`Season: ${season}`);
  console.log(`Game Number: ${gameNum}`);
  console.log(`Stat Type: ${statType}`);
  console.log('');

  try {
    if (statType === 'batting' || statType === 'all') {
      console.log('📊 Testing Batting Stats...');
      const battingStats = await getGameBattingStats(player, season, gameNum);
      console.log('✅ Batting stats retrieved:');
      console.log(JSON.stringify(battingStats, null, 2));
      console.log('');
    }

    if (statType === 'pitching' || statType === 'all') {
      console.log('⚾ Testing Pitching Stats...');
      const pitchingStats = await getGamePitchingStats(player, season, gameNum);
      console.log('✅ Pitching stats retrieved:');
      console.log(JSON.stringify(pitchingStats, null, 2));
      console.log('');
    }

    if (statType === 'fielding' || statType === 'all') {
      console.log('🧤 Testing Fielding Stats...');
      // Fielding requires a position - try common positions
      const positions = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
      for (const pos of positions) {
        try {
          const fieldingStats = await getGameFieldingStats(
            player,
            season,
            gameNum,
            pos,
          );
          if (fieldingStats) {
            console.log(`✅ Fielding stats retrieved for position ${pos}:`);
            console.log(JSON.stringify(fieldingStats, null, 2));
            break;
          }
        } catch {
          // Try next position
          continue;
        }
      }
      console.log('');
    }

    console.log('✅ Test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error occurred:');
    console.error(error);

    if (
      typeof error === 'object' &&
      error !== null &&
      'details' in error &&
      (error as { details?: unknown }).details !== undefined
    ) {
      console.error('\n📋 Error Details:');
      console.error(
        JSON.stringify((error as { details?: unknown }).details, null, 2),
      );
    }

    process.exit(1);
  }
}

void main();

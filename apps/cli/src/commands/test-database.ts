#!/usr/bin/env node

import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';

/**
 * Example CLI script demonstrating database service usage
 */
async function main() {
  try {
    const dbService = createDatabaseService(getDbOptions());

    console.log('🔧 Legacy Sports Database CLI');
    console.log('=============================\n');

    // Test user operations
    console.log('📊 Testing User Operations:');

    // Get all users with limit
    const users = await dbService.users.getUsers({
      limit: 5,
      orderBy: 'id',
      orderDirection: 'asc',
    });
    console.log(`Found ${users.length} users:`);
    users.forEach((user) => {
      console.log(
        `  - ID: ${user.id}, Email: ${user.email || 'N/A'}, Username: ${
          user.username || 'N/A'
        }`
      );
    });

    // Count total users
    const userCount = await dbService.users.countUsers();
    console.log(`\nTotal users in database: ${userCount}`);

    // Get a specific user
    if (users.length > 0) {
      const userId = users[0].id;
      if (userId !== null) {
        const firstUser = await dbService.users.getUserById(userId);
        console.log(`\nFirst user details:`, firstUser);
      }
    }

    console.log('\n⚾ Testing Player Operations:');

    // Get all players with limit
    const players = await dbService.players.getPlayers({
      limit: 5,
      orderBy: 'name',
      orderDirection: 'asc',
    });
    console.log(`Found ${players.length} players:`);
    players.forEach((player) => {
      console.log(
        `  - ID: ${player.id}, Name: ${player.name}, BRef ID: ${player.brefId}`
      );
    });

    // Count total players
    const playerCount = await dbService.players.countPlayers();
    console.log(`\nTotal players in database: ${playerCount}`);

    // Search for players
    if (playerCount > 0) {
      const searchResults = await dbService.players.searchPlayers('a', 3);
      console.log(`\nPlayers with 'a' in name (first 3):`);
      searchResults.forEach((player) => {
        console.log(`  - ${player.name} (${player.brefId})`);
      });
    }

    console.log('\n✅ Database operations completed successfully!');
  } catch (error) {
    console.error('❌ Error running database operations:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main };

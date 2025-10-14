#!/usr/bin/env tsx
/**
 * Script to check if there are any leagues in the database
 */

import { config } from 'dotenv';
import { Pool } from 'pg';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(__dirname, '../.env') });

// Import db-client functions
import { resolveDatabaseCredentials } from '../lib/db-client/src/config/credentials';

async function checkLeagues() {
  console.log('🔍 Checking for leagues in the database...\n');

  let pool: Pool | undefined;

  try {
    // Get database credentials
    console.log('Loading database credentials...');
    const credentials = await resolveDatabaseCredentials({
      useLocalCredentials: process.env.USE_LOCAL_CREDENTIALS === 'true',
      secretName: process.env.DB_SECRET_NAME || process.env.DB_CREDS_PATH,
    });

    // Create connection
    pool = new Pool({
      host: credentials.host,
      port: credentials.port,
      user: credentials.user,
      password: credentials.password,
      database: credentials.database,
      ssl: { rejectUnauthorized: false },
    });

    console.log('Connected to database!\n');

    // Get all leagues
    const leaguesResult = await pool.query(`
      SELECT 
        id, 
        name, 
        owner, 
        max_roster_size,
        current_matchup,
        draft_status,
        invite_code
      FROM leagues
      ORDER BY id DESC
      LIMIT 20
    `);

    if (leaguesResult.rows.length === 0) {
      console.log('❌ No leagues found in the database');
      console.log('\nTo create a league, you can:');
      console.log('1. Navigate to /baseball in your web app');
      console.log('2. Click "Create New League"');
      console.log('3. Or use the GraphQL mutation: createLeagueAndTeams');
    } else {
      console.log(`✅ Found ${leaguesResult.rows.length} league(s):\n`);
      leaguesResult.rows.forEach((league, index) => {
        console.log(`${index + 1}. "${league.name}"`);
        console.log(`   ID: ${league.id}`);
        console.log(`   Owner ID: ${league.owner}`);
        console.log(`   Max Roster Size: ${league.max_roster_size}`);
        console.log(`   Draft Status: ${league.draft_status}`);
        console.log(`   Invite Code: ${league.invite_code}`);
        console.log('');
      });
    }

    // Also check league members
    const membersResult = await pool.query(
      'SELECT COUNT(*) as count FROM league_members',
    );
    console.log(
      `\n📊 Total league members in database: ${membersResult.rows[0].count}`,
    );

    // Check teams
    const teamsResult = await pool.query('SELECT COUNT(*) as count FROM teams');
    console.log(`📊 Total teams in database: ${teamsResult.rows[0].count}`);
  } catch (error) {
    console.error('❌ Error checking leagues:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

checkLeagues()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

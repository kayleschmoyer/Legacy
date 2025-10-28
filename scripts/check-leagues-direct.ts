/**
 * Simple script to check if there are any leagues in the database
 * Run with: pnpm exec tsx scripts/check-leagues-direct.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { Pool } from 'pg';
import { readFileSync } from 'fs';

// Load environment variables
config({ path: resolve(__dirname, '..', '.env') });

async function loadDbCredentials() {
  // Import dynamically to avoid build-time issues
  const { resolveDatabaseCredentials } = await import(
    '../lib/db-client/src/config/credentials'
  );

  return await resolveDatabaseCredentials({
    useLocalCredentials: false,
    secretName: process.env.DB_SECRET_NAME || process.env.DB_CREDS_PATH,
  });
}

async function checkLeagues() {
  console.log('🔍 Checking for leagues in database...');

  const creds = await loadDbCredentials();

  const pool = new Pool({
    host: creds.host,
    port: parseInt(String(creds.port)),
    user: creds.user,
    password: creds.password,
    database: creds.database,
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(
        resolve(__dirname, '..', 'certs', 'us-east-1-bundle.pem'),
      ).toString(),
    },
  });

  try {
    // Query for leagues
    const result = await pool.query(
      'SELECT id, name, owner, "draftStatus", "inviteCode" FROM leagues LIMIT 10',
    );

    if (result.rows.length === 0) {
      console.log('❌ No leagues found in database');
    } else {
      console.log(`✅ Found ${result.rows.length} league(s):`);
      console.table(result.rows);
    }

    // Also check total count
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM leagues',
    );
    console.log(`\n📊 Total leagues in database: ${countResult.rows[0].total}`);
  } catch (error) {
    console.error('❌ Error checking leagues:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkLeagues()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });

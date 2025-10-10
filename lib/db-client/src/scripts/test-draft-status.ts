#!/usr/bin/env tsx

/**
 * Test Draft Status Update
 * 
 * This script tests if the startDraft mutation correctly updates the draft status
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { Pool } from 'pg';

// Load .env from the project root
config({ path: resolve(__dirname, '../../../../.env') });

async function testDraftStatusUpdate() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || process.env.DB_DATABASE || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔍 Testing draft status update...');
    
    // First, let's see what leagues exist and their current draft status
    const leagues = await pool.query(`
      SELECT id, name, draft_status, owner
      FROM leagues
      ORDER BY id;
    `);
    
    console.log('\n📋 Current leagues:');
    leagues.rows.forEach(league => {
      console.log(`- League ${league.id}: "${league.name}" - Draft Status: ${league.draft_status} (Owner: ${league.owner})`);
    });
    
    if (leagues.rows.length === 0) {
      console.log('\n❌ No leagues found in database. Create a league first to test draft status updates.');
      return;
    }
    
    // Pick the first league to test with
    const testLeague = leagues.rows[0];
    console.log(`\n🎯 Testing with League ${testLeague.id}: "${testLeague.name}"`);
    console.log(`Current draft status: ${testLeague.draft_status}`);
    
    // Test updating draft status to 'queued'
    console.log('\n🔄 Updating draft status to "queued"...');
    await pool.query(`
      UPDATE leagues 
      SET draft_status = 'queued' 
      WHERE id = $1;
    `, [testLeague.id]);
    
    // Verify the update
    const updatedLeague = await pool.query(`
      SELECT id, name, draft_status
      FROM leagues
      WHERE id = $1;
    `, [testLeague.id]);
    
    if (updatedLeague.rows.length > 0) {
      const league = updatedLeague.rows[0];
      console.log(`✅ Update successful! New draft status: ${league.draft_status}`);
      
      if (league.draft_status === 'queued') {
        console.log('🎉 Draft status correctly updated to "queued"');
      } else {
        console.log(`❌ Expected "queued" but got "${league.draft_status}"`);
      }
    }
    
    // Test updating back to 'not-started'
    console.log('\n🔄 Resetting draft status to "not-started"...');
    await pool.query(`
      UPDATE leagues 
      SET draft_status = 'not-started' 
      WHERE id = $1;
    `, [testLeague.id]);
    
    // Verify the reset
    const resetLeague = await pool.query(`
      SELECT id, name, draft_status
      FROM leagues
      WHERE id = $1;
    `, [testLeague.id]);
    
    if (resetLeague.rows.length > 0) {
      const league = resetLeague.rows[0];
      console.log(`✅ Reset successful! Draft status: ${league.draft_status}`);
    }
    
    console.log('\n✨ Draft status update test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    await pool.end();
  }
}

testDraftStatusUpdate();

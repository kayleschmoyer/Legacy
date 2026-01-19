import { config } from 'dotenv';
import { Pool } from 'pg';
import { resolve } from 'path';
import { getDatabaseConfig } from './src/config/database';

config({ path: resolve(__dirname, '../../../.env') });

void (async () => {
  const dbConfig = await getDatabaseConfig();
  const pool = new Pool({ ...dbConfig, port: 5432, max: 1 });

  try {
    console.log('Checking matchups table constraints...\n');

    const result = await pool.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints 
      WHERE table_name = 'matchups' 
      AND constraint_type = 'UNIQUE'
    `);

    console.log('Current unique constraints on matchups table:');
    if (result.rows.length === 0) {
      console.log(
        '  ✓ No unique constraints found (constraint was already dropped)',
      );
    } else {
      console.log(result.rows);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
})();

const { config } = require('dotenv');
const { resolve } = require('path');
const { Client } = require('pg');

// Load environment variables from workspace root
config({ path: resolve(__dirname, '../../.env') });

console.log('Testing database connection...');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_CERT_PATH:', process.env.DB_CERT_PATH);
console.log(
  'Resolved cert path:',
  resolve(__dirname, '../..', process.env.DB_CERT_PATH)
);

const client = new Client({
  host: process.env.DB_HOST.replace(':5432', ''), // Remove port from hostname if present
  port: 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'postgres',
  // Try without SSL first
  ssl: false,
});

async function testConnection() {
  try {
    console.log('Attempting to connect...');
    await client.connect();
    console.log('✅ Connected successfully!');

    const result = await client.query('SELECT version()');
    console.log('Database version:', result.rows[0].version);

    await client.end();
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Error details:', error);
  }
}

testConnection();

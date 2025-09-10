require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

async function testConnection() {
  console.log('Testing database connectivity...');

  const config = {
    host: process.env.DB_HOST.replace(':5432', ''),
    port: 5432,
    database: 'postgres',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };

  // Add SSL configuration if DB_CERT_PATH is not present (remote connection)
  if (!process.env.DB_CERT_PATH) {
    config.ssl = {
      rejectUnauthorized: false,
    };
  } else {
    // Local connection with certificate
    console.log(`Using certificate: ${process.env.DB_CERT_PATH}`);
    config.ssl = {
      ca: fs.readFileSync(process.env.DB_CERT_PATH),
    };
  }

  console.log(`Connecting to: ${config.host}`);
  console.log(`User: ${config.user}`);
  console.log(`SSL enabled: ${!!config.ssl}`);

  const pool = new Pool(config);

  try {
    const client = await pool.connect();
    console.log('✅ Successfully connected to database');

    // Test a simple query
    const result = await client.query('SELECT version()');
    console.log(
      `✅ Database version: ${result.rows[0].version
        .split(' ')
        .slice(0, 2)
        .join(' ')}`
    );

    // Test schema access
    const schemas = await client.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('public', 'internal')"
    );
    console.log(
      `✅ Available schemas: ${schemas.rows
        .map((r) => r.schema_name)
        .join(', ')}`
    );

    client.release();
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    await pool.end();
  }
}

testConnection();

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-base-to-string */
import { LOGGER } from '@legacy-sports/logging';
import { resolveDatabaseCredentials } from '@legacy-sports/db-client';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import path from 'path';

interface HandleGetPlayerPitchingArgs {
  player?: string;
  format?: string;
  limit?: number;
}

export async function handleGetPlayerPitching(
  args: HandleGetPlayerPitchingArgs,
): Promise<void> {
  const { player, format, limit } = args;

  LOGGER.info(`⚾ Fetching pitching stats for player: ${player}`);

  try {
    // Use config similar to db-cli
    const useLocal = process.env.USE_LOCAL_CREDENTIALS === 'true';
    const config = {
      useLocalCredentials: useLocal,
      secretName: process.env.DB_SECRET_NAME || process.env.DB_CREDS_PATH,
      defaultDatabase: 'postgres',
      defaultHost: process.env.DB_HOST || process.env.DB_HOST_DIRECT,
      defaultPort: 5432,
    };

    // Resolve credentials
    const credentials = await resolveDatabaseCredentials(config);

    // Create direct database connection using pg
    const certPath = path.join(
      __dirname,
      '../../../../certs/us-east-1-bundle.pem',
    );
    const pool = new Pool({
      host: credentials.host,
      port: credentials.port,
      user: credentials.user,
      password: credentials.password,
      database: credentials.database,
      ssl: {
        rejectUnauthorized: true,
        ca: readFileSync(certPath).toString(),
      },
    });

    try {
      // Build query
      let query = `
        SELECT 
          p.first_name,
          p.last_name,
          p.bref_id,
          sp.season,
          sp.team,
          sp.lg_id,
          sp.w,
          sp.l,
          sp.earned_run_avg,
          sp.g,
          sp.gs,
          sp.gf,
          sp.cg,
          sp.sho,
          sp.sv,
          sp.ip,
          sp.h,
          sp.r,
          sp.er,
          sp.hr,
          sp.bb,
          sp.so,
          sp.whip,
          sp.hits_per_nine,
          sp.homeruns_per_nine,
          sp.bb_per_nine,
          sp.so_per_nine
        FROM season_pitching sp
        JOIN players p ON sp.player_id = p.id
        WHERE p.bref_id = $1
        ORDER BY sp.season DESC
      `;

      if (limit) {
        query += ` LIMIT ${limit}`;
      }

      const result = await pool.query(query, [player]);

      if (!result.rows || result.rows.length === 0) {
        LOGGER.info('❌ No pitching stats found for this player');
        return;
      }

      LOGGER.info(`✅ Found ${result.rows.length} season(s) of pitching stats`);

      if (format === 'json') {
        // Output as JSON
        console.log(JSON.stringify(result.rows, null, 2));
      } else {
        // Output as table
        if (result.rows.length > 0) {
          // Define columns to display
          const displayColumns = [
            'season',
            'team',
            'lg_id',
            'w',
            'l',
            'earned_run_avg',
            'g',
            'gs',
            'sv',
            'ip',
            'h',
            'er',
            'hr',
            'bb',
            'so',
            'whip',
          ];

          // Print player name
          const firstRow = result.rows[0];
          console.log(
            `\nPlayer: ${firstRow.first_name} ${firstRow.last_name} (${firstRow.bref_id})`,
          );
          console.log('='.repeat(80));

          // Log column headers
          console.log('\n' + displayColumns.join(' | '));
          console.log('-'.repeat(displayColumns.join(' | ').length));

          // Log each row
          result.rows.forEach((row) => {
            const values = displayColumns.map((col) => {
              const val = (row as Record<string, unknown>)[col];
              if (val === null || val === undefined) return 'NULL';
              // Handle objects
              if (typeof val === 'object') return JSON.stringify(val);
              // Format numbers with proper precision
              if (
                typeof val === 'number' &&
                ['earned_run_avg', 'whip'].includes(col)
              ) {
                return val.toFixed(2);
              }
              // At this point val is string | number | boolean | symbol | bigint
              return typeof val === 'string'
                ? val
                : typeof val === 'number'
                  ? val.toString()
                  : String(val);
            });
            console.log(values.join(' | '));
          });
          console.log('');
        }
      }
    } finally {
      await pool.end();
    }
  } catch (error) {
    LOGGER.error('❌ Failed to fetch pitching stats');
    if (error instanceof Error) {
      LOGGER.error(`Error: ${error.message}`);
      if (error.stack) {
        LOGGER.debug(`Stack trace: ${error.stack}`);
      }
    } else {
      LOGGER.error(`Unknown error: ${String(error)}`);
    }
    throw error;
  }
}

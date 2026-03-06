/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-base-to-string */
import { LOGGER } from '@legacy-sports/logging';
import { resolveDatabaseCredentials } from '@legacy-sports/db-client';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import path from 'path';

interface HandleGetPlayerFieldingArgs {
  player?: string;
  format?: string;
  position?: string;
  limit?: number;
}

export async function handleGetPlayerFielding(
  args: HandleGetPlayerFieldingArgs,
): Promise<void> {
  const { player, format, position, limit } = args;

  LOGGER.info(`🧤 Fetching fielding stats for player: ${player}`);

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
          sf.season,
          sf.team,
          sf.lg_id,
          sf.pos,
          sf.g,
          sf.gs,
          sf.inn_def,
          sf.po,
          sf.a,
          sf.e_def,
          sf.dp_def,
          sf.fielding_perc,
          sf.range_factor_per_nine,
          sf.range_factor_per_game,
          sf.sb,
          sf.cs,
          sf.caught_stealing_perc,
          sf.pickoffs
        FROM season_fielding sf
        JOIN players p ON sf.player_id = p.id
        WHERE p.bref_id = $1
      `;

      const queryParams: (string | number)[] = [player];

      if (position) {
        query += ` AND sf.pos = $2`;
        queryParams.push(position);
      }

      query += ` ORDER BY sf.season DESC, sf.pos`;

      if (limit) {
        query += ` LIMIT ${limit}`;
      }

      const result = await pool.query(query, queryParams);

      if (!result.rows || result.rows.length === 0) {
        LOGGER.info('❌ No fielding stats found for this player');
        return;
      }

      LOGGER.info(`✅ Found ${result.rows.length} season(s) of fielding stats`);

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
            'pos',
            'g',
            'gs',
            'inn_def',
            'po',
            'a',
            'e_def',
            'dp_def',
            'fielding_perc',
            'range_factor_per_nine',
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
                ['fielding_perc', 'range_factor_per_nine'].includes(col)
              ) {
                return val.toFixed(3);
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
    LOGGER.error('❌ Failed to fetch fielding stats');
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

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-base-to-string */
import { Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import { resolveDatabaseCredentials } from '@legacy-sports/db-client';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import path from 'path';

export const getPlayerBattingCommandBuilder = (argv: Argv) =>
  argv
    .usage('get-player-batting --player <bref_id>')
    .option('player', {
      alias: 'p',
      describe: 'Player Baseball Reference ID (bref_id)',
      type: 'string',
      demandOption: true,
    })
    .option('format', {
      alias: 'f',
      describe: 'Output format (table, json)',
      type: 'string',
      default: 'table',
      choices: ['table', 'json'],
    })
    .option('limit', {
      alias: 'l',
      describe: 'Maximum number of seasons to return',
      type: 'number',
    });

type ArgsType<T> = T extends Argv<infer P> ? P : never;

type HandleGetPlayerBattingArgs = ArgsType<
  ReturnType<typeof getPlayerBattingCommandBuilder>
>;

export async function handleGetPlayerBatting(
  args: HandleGetPlayerBattingArgs,
): Promise<void> {
  const { player, format, limit } = args;

  LOGGER.info(`🏏 Fetching batting stats for player: ${player}`);

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
          sb.season,
          sb.team,
          sb.lg_id,
          sb.g,
          sb.pa,
          sb.ab,
          sb.r,
          sb.h,
          sb.doubles,
          sb.triples,
          sb.hr,
          sb.rbi,
          sb.sb,
          sb.cs,
          sb.bb,
          sb.so,
          sb.batting_avg,
          sb.onbase_perc,
          sb.slugging_perc,
          sb.onbase_plus_slugging
        FROM season_batting sb
        JOIN players p ON sb.player_id = p.id
        WHERE p.bref_id = $1
        ORDER BY sb.season DESC
      `;

      if (limit) {
        query += ` LIMIT ${limit}`;
      }

      const result = await pool.query(query, [player]);

      if (!result.rows || result.rows.length === 0) {
        LOGGER.info('❌ No batting stats found for this player');
        return;
      }

      LOGGER.info(`✅ Found ${result.rows.length} season(s) of batting stats`);

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
            'g',
            'ab',
            'r',
            'h',
            'doubles',
            'triples',
            'hr',
            'rbi',
            'sb',
            'bb',
            'so',
            'batting_avg',
            'onbase_perc',
            'slugging_perc',
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
                ['batting_avg', 'onbase_perc', 'slugging_perc'].includes(col)
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
    LOGGER.error('❌ Failed to fetch batting stats');
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

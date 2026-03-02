/**
 * One-time script: Create matchups for league 93 (LS-371 unblock)
 *
 * League 93 got stuck after an automated draft because the draft-processor Lambda
 * never called createAllMatchupsForLeague. This script fixes the specific league
 * so the user can access their roster immediately.
 *
 * Run from workspace root:
 *   cd D:\code\legacy-sports
 *   pnpm exec tsx --tsconfig tsconfig.dev.json scripts/unblock-league-93.ts
 */

import {
  createAllMatchupsForLeague,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';

const LEAGUE_ID = 93;

async function main() {
  console.log(`Creating matchups for league ${LEAGUE_ID}...`);

  await runWithPublicClient(getDbOptions(), async (db) => {
    const result = await createAllMatchupsForLeague(db, LEAGUE_ID);
    console.log('Matchups created:', result);
  });

  console.log(
    'Done! League 93 should now have matchups and currentMatchup set.',
  );
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});

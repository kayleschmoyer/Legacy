import { config } from 'dotenv';
import { LOGGER } from '@legacy-sports/logging';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * CommandArgs interface defines the structure for command line arguments.
 */
export interface CommandArgs {
  useDotenvFile?: boolean;
}

/**
 * Gets the git repository root directory
 */
function getGitRepoRoot(): string {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
    }).trim();
  } catch (error) {
    LOGGER.error('Failed to get git repository root:');
    LOGGER.error(String(error));
    throw error;
  }
}

/**
 * Loads environment variables from a .env file if specified in the command arguments.
 * @param args The command arguments containing the flag for using the .env file.
 */
export function loadEnvFile(args: CommandArgs): void {
  if (args.useDotenvFile) {
    const rootDir = getGitRepoRoot();
    const envPath = path.join(rootDir, '.env');
    LOGGER.info('Loading environment from .env file at:');
    LOGGER.info(envPath);
    config({ path: envPath });
  }
}

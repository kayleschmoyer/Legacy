import { resolve } from 'node:path';
import { getSql } from '../db-connection.js';
import { getRepoRoot, runCommand, runPnpm } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface HealthResult {
  dockerRunning: boolean;
  postgresReachable: boolean;
  migrationsUpToDate: boolean;
  issues: string[];
}

/** Check if Docker Desktop is running. */
async function checkDocker(): Promise<boolean> {
  try {
    await runCommand('docker', ['info'], process.cwd());
    return true;
  } catch {
    return false;
  }
}

/** Check if Postgres is reachable via the configured DATABASE_URL. */
async function checkPostgres(): Promise<boolean> {
  try {
    const sql = getSql();
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Check if all migrations are applied. */
async function checkMigrations(repoRoot: string): Promise<boolean> {
  try {
    const dbClientDir = resolve(repoRoot, 'lib', 'db-client');
    const output = await runPnpm(['run', 'db:status'], dbClientDir);
    return /0\s+pending|no (?:new )?migrations|up.to.date/i.test(output);
  } catch {
    return false;
  }
}

export async function checkHealth(): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const issues: string[] = [];

  const dockerRunning = await checkDocker();
  if (!dockerRunning) {
    issues.push('Docker is not running. Start Docker Desktop first.');
  }

  const postgresReachable = await checkPostgres();
  if (!postgresReachable) {
    issues.push(
      'Cannot connect to PostgreSQL. Check DATABASE_URL in .env and ensure the database is running.',
    );
  }

  let migrationsUpToDate = false;
  if (postgresReachable) {
    migrationsUpToDate = await checkMigrations(repoRoot);
    if (!migrationsUpToDate) {
      issues.push('Pending migrations detected. Run db_migrate to apply them.');
    }
  } else {
    issues.push('Skipped migration check — Postgres is unreachable.');
  }

  const result: HealthResult = {
    dockerRunning,
    postgresReachable,
    migrationsUpToDate,
    issues,
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

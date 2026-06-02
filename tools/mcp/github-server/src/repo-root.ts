import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the repository root from this script's location
 * (tools/mcp/github-server/src/).
 *
 * Kept in its own module because it uses `import.meta.url`, which cannot be
 * compiled under the CommonJS tsconfig the Jest preset uses. Isolating it here
 * lets specs mock this module and unit-test the rest of `auth.ts` (LS-5982).
 */
export function getRepoRoot(): string {
  const thisDir = resolve(fileURLToPath(import.meta.url), '..');
  return resolve(thisDir, '..', '..', '..', '..');
}

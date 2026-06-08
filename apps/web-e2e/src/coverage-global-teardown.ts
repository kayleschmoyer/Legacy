import { LOGGER } from '@legacy-sports/logging';
import { COLLECT_COVERAGE, mergeShardFragments } from './fixtures/coverage';

/**
 * Playwright globalTeardown for the hermetic e2e suite (LS-7849).
 *
 * Merges this shard's per-worker coverage fragments (written by the _coverage
 * auto-fixture in fixtures/auth-enhanced.ts) into a single per-shard
 * coverage-fragment.json that the nightly workflow uploads to S3. Gated on
 * COLLECT_COVERAGE, so it is a no-op for PR CI and local runs.
 */
export default function globalTeardown(): void {
  if (!COLLECT_COVERAGE) return;
  const { specs, files } = mergeShardFragments();
  LOGGER.info(
    `[e2e teardown] Coverage fragment: ${specs} spec(s), ${files} file ref(s).`,
  );
}

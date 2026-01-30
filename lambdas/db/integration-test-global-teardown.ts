import { teardownIntegrationTestDatabase } from './integration-test-setup';

/**
 * Global teardown for all integration tests
 * Stops PostgreSQL container and cleans up resources
 */
export default async function globalTeardown() {
  console.log('\n🧹 Shutting down integration test environment...\n');
  await teardownIntegrationTestDatabase();
  console.log('\n✅ Integration test environment cleaned up\n');
}

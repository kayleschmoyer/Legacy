// Register TypeScript path mappings FIRST
require('./register-paths');

import { setupIntegrationTestDatabase } from './integration-test-setup';

/**
 * Global setup for all integration tests
 * Starts PostgreSQL container and runs migrations once
 */
export default async function globalSetup() {
  console.log('\n🚀 Starting integration test environment...\n');
  await setupIntegrationTestDatabase();
  console.log('\n✅ Integration test environment ready\n');
}

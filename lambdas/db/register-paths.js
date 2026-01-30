/**
 * Register TypeScript path mappings for Jest globalSetup
 * This file must be CommonJS (.js) to run before TypeScript transformation
 */

const { register } = require('tsconfig-paths');
const { join } = require('path');

// Register paths from tsconfig.base.json
register({
  baseUrl: join(__dirname, '../..'),
  paths: {
    '@legacy-sports/analytics': ['lib/analytics/src/index.ts'],
    '@legacy-sports/api': ['lib/api/src/index.ts'],
    '@legacy-sports/aws-utils': ['lib/aws-utils/src/index.ts'],
    '@legacy-sports/bref-client': ['lib/bref-client/src/index.ts'],
    '@legacy-sports/data-loaders': ['lib/data-loaders/src/index.ts'],
    '@legacy-sports/db-client': ['lib/db-client/src/index.ts'],
    '@legacy-sports/env-utilities': ['lib/env-utilities/src/index.ts'],
    '@legacy-sports/logging': ['lib/logging/src/index.ts'],
    '@legacy-sports/scheduling': ['lib/scheduling/src/index.ts'],
    '@legacy-sports/scoring': ['lib/scoring/src/index.ts'],
    '@legacy-sports/sentry': ['lib/sentry/src/index.ts'],
    '@legacy-sports/shared-components': ['lib/shared-components/src/index.ts'],
    '@legacy-sports/tamagui-config': ['lib/tamagui-config/src/index.ts'],
    '@legacy-sports/ui-abstractions': ['lib/ui-abstractions/src/index.ts'],
    '@legacy-sports/utils': ['lib/utils/src/index.ts'],
  },
});

console.log('✅ TypeScript path mappings registered for Jest globalSetup');

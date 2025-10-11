// Mobile-only exports - excludes server-side AWS dependencies

// Safe database types and utilities for mobile
export * from './types';
export * from './config/database';

// Client interfaces (but not implementations that use AWS)
export * from './lib/client/abstract/DbClient';

// Safe utilities that don't depend on AWS
export * from './lib/DraftUtils';

// Note: DraftService is excluded because it depends on AWS SQS
// Mobile apps should use GraphQL mutations for draft operations
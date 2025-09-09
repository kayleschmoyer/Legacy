// Export all GraphQL generated types, queries, and hooks
export * from './shared/graphql.generated';

// Export organized resources for structured imports
export * as resources from './resources';

// Re-export commonly used fragments and types for convenience
export type { Player } from './shared/graphql.generated';

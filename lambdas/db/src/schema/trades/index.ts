/**
 * Trades domain — barrel export
 *
 * Importing this file registers all Trade-related GraphQL types,
 * queries, and mutations on the shared builder via side-effect imports.
 */

// Type definitions must come first — queries/mutations reference them
import './types';

// Query fields
import './queries';

// Mutation fields
import './mutations';

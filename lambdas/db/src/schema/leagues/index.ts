/**
 * League domain — barrel export
 *
 * Importing this file registers all League-related GraphQL types,
 * queries, and mutations on the shared builder via side-effect imports.
 */

// Type definitions (must come first — queries/mutations reference these)
import './types';

// Query fields
import './queries';

// Mutation fields
import './mutations';

// Re-export types that other schema modules need
export { Team, CommissionerAuditLog } from './types';

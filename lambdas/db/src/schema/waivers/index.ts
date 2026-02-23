/**
 * Waivers domain — barrel export
 *
 * Importing this file registers all Waiver-related GraphQL types,
 * queries, and mutations on the shared builder via side-effect imports.
 */

// Type definitions (must come first — queries/mutations reference these)
import './types';

// Query fields
import './queries';

// Mutation fields
import './mutations';

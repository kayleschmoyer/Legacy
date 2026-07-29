/**
 * Keeper designations domain — barrel export (LS-8673)
 *
 * Importing this file registers all keeper-designation GraphQL types,
 * queries, and mutations on the shared builder via side-effect imports.
 */

// Type definitions (must come first — queries/mutations reference these)
import './types';

// Query fields
import './queries';

// Mutation fields
import './mutations';

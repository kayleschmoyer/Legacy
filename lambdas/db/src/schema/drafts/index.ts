/**
 * Drafts domain — barrel export
 *
 * Importing this file registers all Draft-related GraphQL types,
 * queries, and mutations on the shared builder via side-effect imports.
 */

// Type definitions (must come first — queries/mutations reference these)
import './types';

// Query fields
import './queries';

// Mutation fields
import './mutations';

// Scheduled (system) mutation fields
import './scheduled-mutations';

// Re-export types that other schema modules may need
export { DraftPick, Draft, CurrentDraftPick, DraftPlayer } from './types';

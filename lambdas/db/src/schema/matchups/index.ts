/**
 * Matchups domain — barrel export
 *
 * Importing this file registers all Matchup-related GraphQL types,
 * queries, and mutations on the shared builder via side-effect imports.
 */

// Type definitions (must come first — queries/mutations reference these)
import './types';

// Query fields
import './queries';

// Mutation fields
import './mutations';

// Scheduled/system mutations (EventBridge cron triggers)
import './scheduled-mutations';

// Discord score alerts (EventBridge periodic trigger)
import './discord-score-alerts';

// Discord lineup lock reminders (EventBridge hourly trigger)
import './discord-reminders';

// Discord weekly recaps (EventBridge weekly trigger)
import './discord-weekly-recaps';

// Football-specific scheduled mutations (EventBridge seasonal triggers)
import './football-scheduled-mutations';

// Re-export types that other schema modules may need
export { MatchupPlayerGameRef } from './types';

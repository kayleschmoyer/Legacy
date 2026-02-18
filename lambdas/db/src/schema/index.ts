import { builder } from './builder';

// Import all schema modules to register them with the builder
import './users';
import './players';
import './statistics';
import './leagues';
import './matchups';
import './version';
import './scoring';
import './notifications';
import './chat-and-tiebreakers';
import './draft-schema';

// Export the final schema
export const schema = builder.toSchema();

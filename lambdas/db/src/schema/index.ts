import { builder } from './builder';

// Import all schema modules to register them with the builder
import './users';
import './players';
import './statistics';
import './leagues';
import './matchups';
import './notifications';
import './version';
import './scoring';

// Export the final schema
export const schema = builder.toSchema();

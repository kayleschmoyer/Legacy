import { builder } from './builder';

// Import all schema modules to register them with the builder
import './users';
import './players';

// Export the final schema
export const schema = builder.toSchema();

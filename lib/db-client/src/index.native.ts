// Mobile-specific db-client index - only exports types, no services or clients
// that would pull in server-side dependencies like DbOptions, credentials, etc.

// Types only - safe for React Native bundling
export * from './types';

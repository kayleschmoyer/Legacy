/**
 * React Native WebSocket Polyfill (no-op)
 *
 * React Native provides WebSocket globally, so no polyfill is needed.
 * This .native.ts file is picked up by Metro instead of polyfill.ts,
 * preventing the Node.js 'ws' package from being bundled into the RN app.
 */

export {};

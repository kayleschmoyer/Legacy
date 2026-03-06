/**
 * WebSocket Polyfill for Node.js environments
 *
 * In browsers and React Native, WebSocket is available globally.
 * In Node.js, we need to use the 'ws' package.
 */

import { LOGGER } from '@legacy-sports/logging';

/* eslint-disable @typescript-eslint/no-explicit-any -- globalThis cast needed for polyfill */

// Check if we're in a Node.js environment (no window object)
const isNode = typeof window === 'undefined';

if (isNode && typeof globalThis.WebSocket === 'undefined') {
  try {
    // Dynamically import ws package for Node.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
    const WebSocketImpl = require('ws');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    (globalThis as any).WebSocket = WebSocketImpl;
  } catch {
    LOGGER.warn(
      'ws package not found. WebSocketClient requires the "ws" package in Node.js environments. Install it with: pnpm add ws',
    );
  }
}

export {};

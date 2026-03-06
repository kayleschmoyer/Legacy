/**
 * Polyfill Integration Test
 * Verifies that the WebSocket polyfill works correctly in Node.js
 */

/* eslint-disable @typescript-eslint/no-require-imports -- test requires runtime require for polyfill */
/* eslint-disable @typescript-eslint/no-explicit-any -- globals accessed via any cast */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- globals accessed via any cast */
/* eslint-disable @typescript-eslint/no-unsafe-member-access -- globals accessed via any cast */

describe('WebSocket Polyfill', () => {
  it('should make WebSocket available in Node.js environment', () => {
    // Import the polyfill
    require('./polyfill');

    // WebSocket should now be available globally
    expect(typeof WebSocket).toBe('function');
    expect(WebSocket).toBeDefined();
  });

  it('should not override existing WebSocket in browser-like environments', () => {
    // Save original WebSocket if it exists
    const originalWebSocket = (global as any).WebSocket;

    // Mock browser environment
    (global as any).window = {};

    // Re-import polyfill
    jest.resetModules();
    require('./polyfill');

    // Clean up
    delete (global as any).window;

    // Restore or verify WebSocket
    if (originalWebSocket) {
      expect((global as any).WebSocket).toBe(originalWebSocket);
    }
  });
});

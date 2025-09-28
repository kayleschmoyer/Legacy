import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Setup MSW server for Node.js environment (Playwright)
export const server = setupServer(...handlers);

// Start server before all tests
server.listen({
  onUnhandledRequest: 'error',
});

// Reset handlers after each test
export function resetMocks() {
  server.resetHandlers();
}

// Close server after all tests
export function closeMocks() {
  server.close();
}

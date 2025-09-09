import { server } from '../mocks/server';

// Establish API mocking before each test
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  server.resetHandlers();
});

// Clean up after each test
afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  server.resetHandlers();
});

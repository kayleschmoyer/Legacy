import { server } from '../mocks/server';

export default function globalSetup() {
  // Start MSW server for all tests
  server.listen({ onUnhandledRequest: 'error' });
  console.log('MSW server started for e2e tests');
}

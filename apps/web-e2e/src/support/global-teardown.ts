import { server } from '../mocks/server';

export default function globalTeardown() {
  // Stop MSW server after all tests
  server.close();
  console.log('MSW server stopped');
}

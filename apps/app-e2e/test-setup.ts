/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */

// Simple test setup for app-e2e tests without Detox dependency
console.log('🚀 App E2E Test Setup Initialized');
console.log('✅ Jest environment configured for app-e2e tests');

// Basic Jest timeout for e2e tests
jest.setTimeout(120000);

// Global test configuration
beforeAll(() => {
  console.log('📱 App E2E Tests Starting');
  console.log(
    '✅ For full React Native e2e tests, configure Detox with simulators',
  );
});

beforeEach(() => {
  console.log('🧪 Running app e2e test');
});

afterAll(() => {
  console.log('✅ App E2E Tests Completed');
});

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Simple test utilities without Detox dependency
export const TestUtils = {
  delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  checkEnvironment() {
    return {
      nodeEnv: process.env.NODE_ENV || 'development',
      testMode: true,
    };
  },
};

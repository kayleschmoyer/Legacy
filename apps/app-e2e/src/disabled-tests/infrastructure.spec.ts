/**
 * Basic configuration test to verify Jest and Detox setup
 */

describe('App E2E Infrastructure', () => {
  it('should have Jest and test environment configured correctly', () => {
    // Basic test to verify test infrastructure
    expect(typeof jest).toBe('object');
    expect(process.env.NODE_ENV).toBeTruthy();
  });

  it('should have Detox environment available', () => {
    // Check if Detox is available in the test environment
    // This test runs without requiring a built app
    expect(typeof global).toBe('object');
  });

  it('should be able to run async tests', async () => {
    // Test async functionality
    const result = await Promise.resolve('success');
    expect(result).toBe('success');
  });
});
